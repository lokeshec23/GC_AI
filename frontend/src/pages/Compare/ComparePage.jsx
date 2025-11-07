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
  Tooltip,
} from "antd";
import {
  FileExcelOutlined,
  SendOutlined,
  DownloadOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  LoadingOutlined,
  ReloadOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { compareAPI, settingsAPI } from "../../services/api";

const { TextArea } = Input;
const { Option } = Select;

const DEFAULT_COMPARISON_PROMPT = `You are an expert mortgage guideline analyst tasked with comparing two guidelines.

INSTRUCTIONS:
1. Compare the two guidelines provided (Guideline 1 is original, Guideline 2 is updated).
2. Identify what was Added, Removed, Modified, or remains Unchanged.
3. Focus on substantive differences in rules, requirements, and eligibility criteria.
4. Organize the comparison logically by section or category.

OUTPUT FORMAT (JSON ONLY):
Return a JSON array where each object represents a comparison item:

[
  {
    "category": "Added",
    "section": "The section where the rule was added",
    "guideline1_value": "Not present",
    "guideline2_value": "The new rule or requirement in Guideline 2",
    "difference": "A brief explanation of what was added."
  },
  {
    "category": "Modified",
    "section": "The section that changed",
    "guideline1_value": "The original requirement from Guideline 1",
    "guideline2_value": "The updated requirement from Guideline 2",
    "difference": "A summary of what specifically changed between the two versions."
  },
  {
    "category": "Removed",
    "section": "The section from which the rule was removed",
    "guideline1_value": "The rule that was present in Guideline 1",
    "guideline2_value": "Not present",
    "difference": "This rule was removed in the updated guideline."
  }
]

CATEGORIES TO USE:
- "Added"
- "Removed"
- "Modified"
- "Unchanged"

CRITICAL:
- Output ONLY a valid JSON array.
- No markdown, no code blocks, no explanations.
- Start with [ and end with ].`;

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
  const handleResetPrompt = () => {
    setPromptValue(DEFAULT_COMPARISON_PROMPT);
    form.setFieldsValue({ custom_prompt: DEFAULT_COMPARISON_PROMPT });
    message.success("Prompt reset");
  };

  const selectFile1 = () => file1InputRef.current.click();
  const selectFile2 = () => file2InputRef.current.click();

  const handleSubmit = async (values) => {
    if (!file1 || !file2) return message.error("Attach both files");

    setProcessing(true);
    setProgress(0);
    setProcessingModalVisible(true);

    const fd = new FormData();
    fd.append("file1", file1);
    fd.append("file2", file2);
    fd.append("model_provider", values.model_provider);
    fd.append("model_name", values.model_name);
    fd.append("custom_prompt", promptValue.trim());

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
        }
      };
    } catch {
      setProcessing(false);
      setProcessingModalVisible(false);
      message.error("Comparison failed");
    }
  };

  const loadPreview = async (sid) => {
    try {
      const res = await compareAPI.getPreview(sid);
      setPreviewData(res.data);
      setPreviewModalVisible(true);
    } catch {
      message.error("Failed to load results");
    }
  };

  const handleDownload = () => sessionId && compareAPI.downloadExcel(sessionId);
  const closePreview = () => {
    setPreviewModalVisible(false);
    setPreviewData(null);
  };

  const convertRows = (data) => (data || []).map((r, i) => ({ key: i, ...r }));

  const columns = [
    {
      title: "Category",
      dataIndex: "category",
      width: 120,
      render: (t) => <Tag>{t}</Tag>,
    },
    { title: "Section", dataIndex: "section", width: 220 },
    {
      title: file1?.name || "Guideline 1",
      dataIndex: "guideline1_value",
      width: 350,
    },
    {
      title: file2?.name || "Guideline 2",
      dataIndex: "guideline2_value",
      width: 350,
    },
    { title: "Difference", dataIndex: "difference", width: 300 },
  ];

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <h1 className="text-3xl font-bold flex items-center gap-2 mb-2">
        <SwapOutlined /> Compare Guidelines
      </h1>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        {/* Prompt */}
        <Card title="Comparison Prompt" className="mb-6">
          <Form.Item name="custom_prompt">
            <TextArea
              value={promptValue}
              onChange={handlePromptChange}
              style={{ minHeight: "420px" }}
              className="font-mono text-sm"
            />
          </Form.Item>

          {/* THE CONTROL ROW (Requested Layout) */}
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
                >
                  <Option value="openai">OpenAI</Option>
                  <Option value="gemini">Google Gemini</Option>
                </Select>
              </Form.Item>

              <Form.Item name="model_name" noStyle>
                <Select size="large" style={{ width: 200 }}>
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
                onChange={(e) => setFile1(e.target.files[0])}
              />
              <Button
                icon={<PaperClipOutlined />}
                size="large"
                onClick={selectFile1}
              >
                {file1 ? file1.name : "Attach File 1"}
              </Button>

              <input
                ref={file2InputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={(e) => setFile2(e.target.files[0])}
              />
              <Button
                icon={<PaperClipOutlined />}
                size="large"
                onClick={selectFile2}
              >
                {file2 ? file2.name : "Attach File 2"}
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

      {/* Processing Modal */}
      <Modal
        open={processingModalVisible}
        footer={null}
        closable={false}
        centered
        width={600}
      >
        <Progress
          percent={progress}
          strokeWidth={12}
          status={progress === 100 ? "success" : "active"}
        />
        <p className="text-center mt-4">{progressMessage}</p>
      </Modal>

      {/* Preview Modal */}
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
            columns={columns}
            pagination={{ pageSize: 50 }}
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
