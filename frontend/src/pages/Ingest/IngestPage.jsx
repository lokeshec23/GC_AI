// src/pages/Ingest/IngestPage.jsx

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
  Divider,
} from "antd";
import {
  PaperClipOutlined,
  SendOutlined,
  FileTextOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  FileExcelOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { ingestAPI, settingsAPI } from "../../services/api";

const { TextArea } = Input;
const { Option } = Select;

const DEFAULT_PROMPT = `You are an expert mortgage guideline analyst. Your task is to extract key information from the provided text and structure it as a clean, valid JSON array.

INSTRUCTIONS:
1. Analyze the text to identify distinct rules, sections, or data points.
2. For each distinct item, create a JSON object.
3. The structure of the JSON objects should be consistent. You decide on the best keys (e.g., "section", "rule_id", "requirement", "details").

EXAMPLE OUTPUT STRUCTURE (You can adapt this):
[
  {
    "category": "Loan Eligibility",
    "topic": "Credit Score",
    "requirement": "A minimum FICO score of 620 is required for all borrowers."
  },
  {
    "category": "Property",
    "topic": "Appraisal",
    "requirement": "A full appraisal dated within the last 90 days is mandatory."
  }
]

CRITICAL RULES:
- The final output MUST be a single, valid JSON array.
- Do not include any text, explanations, or markdown outside of the JSON array.
- Start your response with '[' and end it with ']'.
- Ensure all strings within the JSON are properly escaped.`;

const IngestPage = () => {
  const [form] = Form.useForm();
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [sessionId, setSessionId] = useState(null);
  const [supportedModels, setSupportedModels] = useState({
    openai: [],
    gemini: [],
  });
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [previewData, setPreviewData] = useState(null);
  const [promptValue, setPromptValue] = useState(DEFAULT_PROMPT);
  const [processingModalVisible, setProcessingModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);
  const [tableColumns, setTableColumns] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSupportedModels();
    form.setFieldsValue({
      model_provider: "openai",
      model_name: "gpt-4o",
      custom_prompt: DEFAULT_PROMPT,
    });
    setPromptValue(DEFAULT_PROMPT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSupportedModels = async () => {
    try {
      const response = await settingsAPI.getSupportedModels();
      setSupportedModels(response.data);
    } catch (error) {
      message.error("Failed to load supported models");
    }
  };

  const handleFileSelect = (event) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.type !== "application/pdf") {
        message.error("Please select a PDF file");
        return;
      }
      setFile(selectedFile);
      message.success(`${selectedFile.name} selected`);
    }
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    message.info("File removed");
  };

  const handleAttachClick = () => fileInputRef.current?.click();
  const handleResetPrompt = () => {
    setPromptValue(DEFAULT_PROMPT);
    form.setFieldsValue({ custom_prompt: DEFAULT_PROMPT });
    message.success("Prompt reset to default");
  };

  const handlePromptChange = (e) => setPromptValue(e.target.value);

  const handleSubmit = async (values) => {
    if (!file) return message.error("Please attach a PDF file.");
    const currentPrompt = promptValue.trim();
    if (!currentPrompt) return message.error("Please enter a prompt.");

    try {
      setProcessing(true);
      setProgress(0);
      setProgressMessage("Initializing...");
      setPreviewData(null);
      setProcessingModalVisible(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("model_provider", values.model_provider);
      formData.append("model_name", values.model_name);
      formData.append("custom_prompt", currentPrompt);

      const response = await ingestAPI.ingestGuideline(formData);
      const { session_id } = response.data;
      setSessionId(session_id);
      message.success("Processing started!");

      const eventSource = ingestAPI.createProgressStream(session_id);
      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress);
        setProgressMessage(data.message);
        if (data.progress >= 100) {
          eventSource.close();
          setProcessing(false);
          setProcessingModalVisible(false);
          fetchPreviewData(session_id);
          message.success("Processing complete!");
        }
      };
      eventSource.onerror = () => {
        eventSource.close();
        setProcessing(false);
        setProcessingModalVisible(false);
        message.error("Connection error. Please try again.");
      };
    } catch (error) {
      setProcessing(false);
      setProcessingModalVisible(false);
      message.error(
        error.response?.data?.detail || "Failed to start processing."
      );
    }
  };

  const fetchPreviewData = async (sid) => {
    try {
      const response = await ingestAPI.getPreview(sid);
      const data = response.data;
      if (data && data.length > 0) {
        const firstItemKeys = Object.keys(data[0]);
        const columns = firstItemKeys.map((key) => ({
          title: key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          dataIndex: key,
          key: key,
          width: 250,
          render: (text) => (
            <div className="whitespace-pre-wrap text-sm">{String(text)}</div>
          ),
        }));
        setTableColumns(columns);
        setPreviewData(data);
      } else {
        setTableColumns([{ title: "Result", dataIndex: "content" }]);
        setPreviewData([
          {
            key: "1",
            content: "No structured data was extracted from the document.",
          },
        ]);
      }
      setPreviewModalVisible(true);
    } catch (error) {
      message.error("Failed to load preview data.");
    }
  };

  const handleDownload = () => {
    if (sessionId) {
      message.loading("Preparing download...", 1);
      ingestAPI.downloadExcel(sessionId);
    }
  };

  const handleClosePreview = () => {
    setPreviewModalVisible(false);
    setPreviewData(null);
    setTableColumns([]);
    setSessionId(null);
  };

  const convertToTableData = (data) => {
    if (!data || !Array.isArray(data)) return [];
    return data.map((item, idx) => ({ key: idx, ...item }));
  };

  return (
    <div className="max-w-screen-2xl w-full mx-auto px-4 md:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-poppins text-gray-800 flex items-center gap-3">
          <FileTextOutlined /> Ingest Guideline
        </h1>
        <p className="text-gray-500 mt-2 text-base">
          Upload a PDF, define your desired JSON structure in the prompt, and
          extract the data.
        </p>
      </div>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Card
          title={
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">
                Extraction Command Center
              </span>
              <Tooltip title="Reset to default prompt">
                <Button
                  type="link"
                  icon={<ReloadOutlined />}
                  onClick={handleResetPrompt}
                  disabled={processing}
                  size="small"
                >
                  Reset Prompt
                </Button>
              </Tooltip>
            </div>
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            hidden
            disabled={processing}
          />
          <Form.Item
            name="custom_prompt"
            rules={[{ required: true, message: "Please enter a prompt" }]}
            className="mb-0"
          >
            <TextArea
              value={promptValue}
              onChange={handlePromptChange}
              placeholder="Describe the JSON structure you want..."
              className="font-mono text-sm resize-none"
              style={{ minHeight: "420px", width: "100%" }}
              disabled={processing}
            />
          </Form.Item>

          <Divider />

          <div className="flex flex-wrap items-center justify-between gap-4">
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
            <Space>
              {file ? (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200 max-w-[240px]">
                  <FileTextOutlined className="text-blue-600" />
                  <span className="text-sm font-medium text-blue-800 truncate">
                    {file.name}
                  </span>
                  <Button
                    type="text"
                    size="small"
                    icon={<CloseCircleOutlined />}
                    onClick={handleRemoveFile}
                    disabled={processing}
                    className="text-blue-600 hover:text-blue-800"
                  />
                </div>
              ) : (
                <Button
                  icon={<PaperClipOutlined />}
                  size="large"
                  className="flex items-center"
                  disabled={processing}
                  onClick={handleAttachClick}
                >
                  Attach PDF
                </Button>
              )}
              <Button
                type="primary"
                htmlType="submit"
                icon={<SendOutlined />}
                size="large"
                loading={processing}
                disabled={processing || !file}
              >
                {processing ? "Processing..." : "Extract Data"}
              </Button>
            </Space>
          </div>
        </Card>
      </Form>

      <Modal
        title={
          <div className="flex items-center gap-2">
            <Spin
              indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
            />
            <span className="text-lg font-semibold">Processing Guideline</span>
          </div>
        }
        open={processingModalVisible}
        footer={null}
        closable={false}
        centered
        width={600}
      >
        <div className="py-6">
          <Progress
            percent={progress}
            status={
              progress < 0
                ? "exception"
                : progress === 100
                ? "success"
                : "active"
            }
            strokeWidth={12}
          />
          <div className="mt-6 text-center">
            <p className="text-gray-600 text-base">{progressMessage}</p>
          </div>
          {file && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <FileTextOutlined />
                <span>
                  Processing: <strong>{file.name}</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={previewModalVisible}
        footer={null}
        closable={false}
        centered
        width="95vw"
        style={{ top: "2.5vh", padding: 0 }}
        maskClosable={false}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <FileExcelOutlined className="text-green-600 text-xl" />
            <span className="font-semibold text-lg">Extraction Results</span>
            <Tag color="blue">
              {convertToTableData(previewData).length} rows extracted
            </Tag>
          </div>
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownload}
              size="large"
            >
              Download Excel
            </Button>
            <Button
              icon={<CloseCircleOutlined />}
              onClick={handleClosePreview}
              size="large"
            >
              Close
            </Button>
          </Space>
        </div>
        <div
          style={{
            height: "calc(95vh - 76px)",
            overflow: "hidden",
            padding: "16px 24px",
          }}
        >
          {previewData ? (
            <div className="h-full overflow-auto">
              <Table
                columns={tableColumns}
                dataSource={convertToTableData(previewData)}
                pagination={{
                  pageSize: 100,
                  showSizeChanger: true,
                  pageSizeOptions: ["50", "100", "200"],
                  showTotal: (total, range) =>
                    `${range[0]}-${range[1]} of ${total} rows`,
                }}
                scroll={{ x: "max-content", y: "calc(95vh - 200px)" }}
                size="small"
                bordered
                sticky
              />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center">
              <Spin size="large" tip="Loading preview..." />
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
};

export default IngestPage;
