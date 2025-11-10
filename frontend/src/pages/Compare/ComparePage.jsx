import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  Form,
  Select,
  Button,
  Input,
  message,
  Progress,
  Space,
  Tag,
  Table,
  Modal,
  Spin,
} from "antd";
import {
  FileExcelOutlined,
  SendOutlined,
  DownloadOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  LoadingOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { compareAPI, settingsAPI } from "../../services/api";

const { TextArea } = Input;
const { Option } = Select;

// Default comparison prompt
const DEFAULT_COMPARISON_PROMPT = `You are an expert mortgage guideline analyst. Your task is to compare two sets of guideline data, "Guideline 1 (Base)" and "Guideline 2 (New)".

INSTRUCTIONS:
1. Thoroughly compare the content of both guidelines.
2. Identify items that were added, removed, or modified.
3. Your output must be a JSON array of objects.

OUTPUT FORMAT (JSON ONLY):
You have the freedom to define the keys, but a good structure would be:
- "category": (e.g., "Added", "Removed", "Modified")
- "section": The topic or section of the rule.
- "guideline_1_summary": What was in the base guideline.
- "guideline_2_summary": What is in the new guideline.
- "change_description": A brief summary of the change.

EXAMPLE:
[
  {
    "category": "Modified",
    "section": "Credit Score Requirement",
    "guideline_1_summary": "Minimum FICO score is 620.",
    "guideline_2_summary": "Minimum FICO score is 640.",
    "change_description": "The minimum FICO score requirement was increased from 620 to 640."
  }
]

CRITICAL RULES:
- The final output MUST be a single, valid JSON array.
- Do not include any text or explanations outside of the JSON array.`;

const ComparePage = () => {
  const [form] = Form.useForm();

  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");

  const [supportedModels, setSupportedModels] = useState({
    openai: [],
    gemini: [],
  });
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [promptValue, setPromptValue] = useState(DEFAULT_COMPARISON_PROMPT);

  const [previewData, setPreviewData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [tableColumns, setTableColumns] = useState([]);

  const [processingModalVisible, setProcessingModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);

  const file1InputRef = useRef(null);
  const file2InputRef = useRef(null);

  useEffect(() => {
    fetchModels();
    form.setFieldsValue({
      model_provider: "openai",
      model_name: "gpt-4o",
      custom_prompt: DEFAULT_COMPARISON_PROMPT,
    });
    setPromptValue(DEFAULT_COMPARISON_PROMPT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchModels = async () => {
    try {
      const res = await settingsAPI.getSupportedModels();
      setSupportedModels(res.data);
    } catch {
      message.error("Failed to load models");
    }
  };

  const handlePromptChange = (e) => setPromptValue(e.target.value);

  const selectFile1 = () => file1InputRef.current.click();
  const selectFile2 = () => file2InputRef.current.click();

  const handleFile1Select = (e) => setFile1(e.target.files[0]);
  const handleFile2Select = (e) => setFile2(e.target.files[0]);

  const handleSubmit = async (values) => {
    if (!file1 || !file2)
      return message.error("Please attach both files for comparison.");
    const currentPrompt = promptValue.trim();
    if (!currentPrompt)
      return message.error("Please enter a comparison prompt.");

    setProcessing(true);
    setProgress(0);
    setProgressMessage("Initializing comparison...");
    setProcessingModalVisible(true);

    const fd = new FormData();
    fd.append("file1", file1);
    fd.append("file2", file2);
    fd.append("model_provider", values.model_provider);
    fd.append("model_name", values.model_name);
    fd.append("custom_prompt", currentPrompt);

    try {
      const res = await compareAPI.compareGuidelines(fd);
      const { session_id } = res.data;
      setSessionId(session_id);

      const sse = compareAPI.createProgressStream(session_id);
      sse.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setProgress(data.progress);
        setProgressMessage(data.message);
        if (data.progress >= 100) {
          sse.close();
          setProcessing(false);
          setProcessingModalVisible(false);
          loadPreview(session_id);
          message.success("Comparison complete!");
        }
      };
      sse.onerror = () => {
        sse.close();
        setProcessing(false);
        setProcessingModalVisible(false);
        message.error("An error occurred during comparison.");
      };
    } catch (error) {
      setProcessing(false);
      setProcessingModalVisible(false);
      message.error(
        error.response?.data?.detail || "Comparison failed to start."
      );
    }
  };

  const loadPreview = async (sid) => {
    try {
      const res = await compareAPI.getPreview(sid);
      const data = res.data;

      if (data && data.length > 0) {
        // Dynamically create columns
        const columns = Object.keys(data[0]).map((key) => ({
          title: key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          dataIndex: key,
          key: key,
          width: 250,
          render: (text) => (
            <div className="whitespace-pre-wrap">{String(text)}</div>
          ),
        }));
        setTableColumns(columns);
        setPreviewData(data);
      } else {
        setTableColumns([{ title: "Result", dataIndex: "content" }]);
        setPreviewData([
          {
            key: "1",
            content:
              "No differences were found or data could not be structured.",
          },
        ]);
      }
      setPreviewModalVisible(true);
    } catch {
      message.error("Failed to load comparison results.");
    }
  };

  const handleDownload = () => {
    if (sessionId) {
      message.loading("Preparing download...", 1);
      compareAPI.downloadExcel(sessionId);
    }
  };

  const closePreview = () => {
    setPreviewModalVisible(false);
    setPreviewData(null);
    setTableColumns([]);
    setSessionId(null);
  };

  const convertRows = (data) => (data || []).map((r, i) => ({ key: i, ...r }));

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <h1 className="text-3xl font-bold font-poppins flex items-center gap-2 mb-2">
        <SwapOutlined /> Compare Guidelines
      </h1>
      <p className="text-gray-500 mb-6">
        Upload two Excel files to identify the differences using an AI model.
      </p>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Card title="Comparison Prompt" className="mb-6">
          <Form.Item name="custom_prompt">
            <TextArea
              value={promptValue}
              onChange={handlePromptChange}
              style={{ minHeight: "420px" }}
              className="font-mono text-sm"
              placeholder="Define the logic for comparing the two files..."
              disabled={processing}
            />
          </Form.Item>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <Space wrap>
              <Form.Item name="model_provider" noStyle>
                <Select
                  size="large"
                  style={{ width: 170 }}
                  onChange={(v) => {
                    setSelectedProvider(v);
                    form.setFieldsValue({
                      model_name: supportedModels[v]?.[0],
                    });
                  }}
                  disabled={processing}
                >
                  <Option value="openai">OpenAI</Option>
                  <Option value="gemini">Google Gemini</Option>
                </Select>
              </Form.Item>

              <Form.Item name="model_name" noStyle>
                <Select
                  size="large"
                  style={{ width: 200 }}
                  disabled={processing}
                >
                  {supportedModels[selectedProvider]?.map((m) => (
                    <Option key={m} value={m}>
                      {m}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Space>

            <Space wrap>
              <input
                ref={file1InputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={handleFile1Select}
                disabled={processing}
              />
              <Button
                icon={<PaperClipOutlined />}
                size="large"
                onClick={selectFile1}
                disabled={processing}
              >
                {file1 ? file1.name : "Attach Guideline 1"}
              </Button>

              <input
                ref={file2InputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={handleFile2Select}
                disabled={processing}
              />
              <Button
                icon={<PaperClipOutlined />}
                size="large"
                onClick={selectFile2}
                disabled={processing}
              >
                {file2 ? file2.name : "Attach Guideline 2"}
              </Button>

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                icon={<SendOutlined />}
                disabled={!file1 || !file2 || processing}
                loading={processing}
              >
                Compare
              </Button>
            </Space>
          </div>
        </Card>
      </Form>

      <Modal
        open={processingModalVisible}
        footer={null}
        closable={false}
        centered
        width={600}
      >
        <div className="py-4">
          <h2 className="text-lg font-semibold text-center mb-4">
            Comparing Guidelines...
          </h2>
          <Progress
            percent={progress}
            strokeWidth={12}
            status={progress === 100 ? "success" : "active"}
          />
          <p className="text-center mt-4 text-gray-600">{progressMessage}</p>
        </div>
      </Modal>

      <Modal
        open={previewModalVisible}
        closable={false}
        centered
        footer={null}
        maskClosable={false}
        width="90vw"
        style={{ top: "5vh" }}
      >
        <div className="flex justify-between items-center mb-4 border-b pb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <SwapOutlined className="text-purple-600" /> Comparison Results
          </h2>
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownload}
            >
              Download Excel
            </Button>
            <Button icon={<CloseCircleOutlined />} onClick={closePreview}>
              Close
            </Button>
          </Space>
        </div>

        <div style={{ height: "calc(90vh - 120px)", overflowY: "auto" }}>
          <Table
            dataSource={convertRows(previewData)}
            columns={tableColumns}
            pagination={{ pageSize: 50, showSizeChanger: true }}
            bordered
            size="small"
            scroll={{ x: "max-content" }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ComparePage;
