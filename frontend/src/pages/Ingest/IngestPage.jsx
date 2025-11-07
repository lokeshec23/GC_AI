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
  Drawer,
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

const DEFAULT_PROMPT = `You are an expert U.S. mortgage underwriting analyst.
You will be given text from a mortgage guideline document.
Your job is to extract and structure it into clean, valid JSON.

INSTRUCTIONS:
1. Identify major sections and subsections based on titles, numbering, or formatting.
2. For each major section, provide a brief 2-3 line summary.
3. For each subsection, extract the key rules, requirements, or eligibility criteria in 2-3 lines.
4. Keep all section and subsection titles exactly as written in the original text.
5. Do NOT add, guess, or infer information not present in the source.
6. Maintain the original hierarchy and document order.

OUTPUT FORMAT (JSON ONLY):
Return a JSON array where each object represents a row with these fields:
- "major_section": The main section title (string)
- "subsection": The subsection title or empty string if it's a section header (string)
- "summary": The summary or key requirements (string)

Example:
[
  {
    "major_section": "301. Non-U.S. Citizen Eligibility",
    "subsection": "",
    "summary": "This section covers eligibility requirements for non-U.S. citizens applying for mortgage loans."
  },
  {
    "major_section": "301. Non-U.S. Citizen Eligibility",
    "subsection": "Work Permit Requirements",
    "summary": "Borrower must have valid work permit or visa. Minimum 3 years of work history required."
  }
]

CRITICAL:
- Output ONLY valid JSON array
- No markdown, no code blocks, no explanations
- Start with [ and end with ]
- Ensure all JSON is properly escaped
- Each object must have all three fields (use empty string "" if not applicable)`;

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

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSupportedModels();

    form.setFieldsValue({
      model_provider: "openai",
      model_name: "gpt-4o",
      custom_prompt: DEFAULT_PROMPT,
    });

    setPromptValue(DEFAULT_PROMPT);
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
    const selectedFile = event.target.files[0];
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    message.info("File removed");
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleResetPrompt = () => {
    setPromptValue(DEFAULT_PROMPT);
    form.setFieldsValue({ custom_prompt: DEFAULT_PROMPT });
    message.success("Prompt reset to default");
  };

  const handlePromptChange = (e) => {
    setPromptValue(e.target.value);
  };

  const handleSubmit = async (values) => {
    if (!file) {
      message.error("Please upload a PDF file");
      return;
    }

    const currentPrompt = promptValue.trim();

    if (!currentPrompt) {
      message.error("Please enter a prompt");
      return;
    }

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

      eventSource.onerror = (error) => {
        console.error("SSE Error:", error);
        eventSource.close();
        setProcessing(false);
        setProcessingModalVisible(false);
        message.error("Connection lost. Please check status manually.");
      };
    } catch (error) {
      setProcessing(false);
      setProcessingModalVisible(false);
      console.error("Submit error:", error);
      message.error(error.response?.data?.detail || "Processing failed");
    }
  };

  const fetchPreviewData = async (sid) => {
    try {
      const response = await ingestAPI.getPreview(sid);
      setPreviewData(response.data);
      setPreviewModalVisible(true);
    } catch (error) {
      console.error("Failed to fetch preview:", error);
      message.error("Failed to load preview data");
    }
  };

  const handleDownload = () => {
    if (sessionId) {
      message.success("Downloading Excel file...");
      ingestAPI.downloadExcel(sessionId);
    }
  };

  const handleClosePreview = () => {
    setPreviewModalVisible(false);
    setPreviewData(null);
    setSessionId(null);
  };

  const convertToTableData = (data) => {
    if (!data || !Array.isArray(data)) {
      console.log("Invalid preview data:", data);
      return [];
    }

    return data.map((item, idx) => ({
      key: idx,
      major_section: item.major_section || "",
      subsection: item.subsection || "",
      summary: item.summary || "",
    }));
  };

  const tableColumns = [
    {
      title: "Major Section Title",
      dataIndex: "major_section",
      key: "major_section",
      width: "30%",
      render: (text, record) => (
        <span
          className={
            text && !record.subsection ? "font-bold text-blue-700" : ""
          }
        >
          {text}
        </span>
      ),
    },
    {
      title: "Subsection Title",
      dataIndex: "subsection",
      key: "subsection",
      width: "30%",
    },
    {
      title: "Summary / Key Requirements",
      dataIndex: "summary",
      key: "summary",
      width: "40%",
      render: (text) => <div className="whitespace-pre-wrap">{text}</div>,
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <FileTextOutlined />
          Ingest Guideline
        </h1>
        <p className="text-gray-600 mt-2">
          Upload a PDF guideline and extract rules using a custom prompt
        </p>
      </div>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        {/* Model Selection */}
        <Card className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item
              label={
                <span className="flex items-center gap-2">
                  <ThunderboltOutlined />
                  <strong>Model Provider</strong>
                </span>
              }
              name="model_provider"
              rules={[{ required: true, message: "Please select a provider" }]}
            >
              <Select
                size="large"
                onChange={(value) => {
                  setSelectedProvider(value);
                  form.setFieldsValue({
                    model_name: supportedModels[value]?.[0],
                  });
                }}
              >
                <Option value="openai">
                  <Space>
                    <Tag color="blue">OpenAI</Tag>
                    GPT Models
                  </Space>
                </Option>
                <Option value="gemini">
                  <Space>
                    <Tag color="green">Google</Tag>
                    Gemini Models
                  </Space>
                </Option>
              </Select>
            </Form.Item>

            <Form.Item
              label={<strong>Model Name</strong>}
              name="model_name"
              rules={[{ required: true, message: "Please select a model" }]}
            >
              <Select size="large">
                {supportedModels[selectedProvider]?.map((model) => (
                  <Option key={model} value={model}>
                    {model}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>
        </Card>

        {/* Prompt Box */}
        <Card
          className="mb-6"
          title={
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Extraction Prompt</span>
              <Tooltip title="Reset to default prompt">
                <Button
                  type="link"
                  icon={<ReloadOutlined />}
                  onClick={handleResetPrompt}
                  disabled={processing}
                  size="small"
                >
                  Reset to Default
                </Button>
              </Tooltip>
            </div>
          }
        >
          <Form.Item
            name="custom_prompt"
            rules={[{ required: true, message: "Please enter a prompt" }]}
            className="mb-0"
          >
            <div className="relative">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: "none" }}
                disabled={processing}
              />

              <TextArea
                value={promptValue}
                onChange={handlePromptChange}
                placeholder="Enter your extraction prompt here..."
                className="font-mono text-sm resize-none pr-24"
                style={{
                  minHeight: "320px",
                  paddingBottom: "60px",
                }}
                disabled={processing}
              />

              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {!file ? (
                  <Button
                    icon={<PaperClipOutlined />}
                    size="large"
                    className="flex items-center gap-2"
                    disabled={processing}
                    onClick={handleAttachClick}
                  >
                    Attach PDF
                  </Button>
                ) : (
                  <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-lg border border-blue-200">
                    <FileTextOutlined className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-800 max-w-[150px] truncate">
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
                )}

                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SendOutlined />}
                  size="large"
                  loading={processing}
                  disabled={processing || !file}
                  className="flex items-center gap-2"
                >
                  {processing ? "Processing..." : "Send"}
                </Button>
              </div>
            </div>
          </Form.Item>

          <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
            💡 <span>Attach a PDF file and click Send to start processing</span>
          </div>
        </Card>
      </Form>
      {/* ✅ Processing Modal */}
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
            status={progress === 100 ? "success" : "active"}
            strokeColor={{
              "0%": "#108ee9",
              "100%": "#87d068",
            }}
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
      {/* ✅ Fullscreen Preview Modal */}
      {/* ✅ Full-height Drawer */}
      <Drawer
        title={
          <div className="flex items-center gap-2">
            <FileExcelOutlined className="text-green-600 text-xl" />
            <span className="font-semibold text-lg">Extraction Results</span>
            <Tag color="blue">
              {convertToTableData(previewData).length} rows
            </Tag>
          </div>
        }
        placement="right"
        width="95vw"
        open={previewModalVisible}
        onClose={handleClosePreview}
        extra={
          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            size="large"
          >
            Download Excel
          </Button>
        }
        bodyStyle={{
          padding: "24px",
          height: "calc(100vh - 108px)",
          overflow: "hidden",
        }}
      >
        {previewData ? (
          <div className="h-full flex flex-col">
            {/* <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200 flex-shrink-0">
              <p className="text-sm text-green-800 flex items-center gap-2">
                <EyeOutlined />
                <span>Preview of extracted data. Scroll to view all rows.</span>
              </p>
            </div> */}

            <div className="flex-1 overflow-hidden">
              <Table
                columns={tableColumns}
                dataSource={convertToTableData(previewData)}
                pagination={{
                  pageSize: 100,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  pageSizeOptions: ["50", "100", "200", "500"],
                  showTotal: (total, range) =>
                    `${range[0]}-${range[1]} of ${total} rows`,
                }}
                scroll={{
                  x: "max-content",
                  y: "calc(100vh - 280px)",
                }}
                size="small"
                bordered
                sticky
                rowClassName={(record) =>
                  record.major_section && !record.subsection
                    ? "bg-blue-50 font-semibold"
                    : ""
                }
              />
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Spin size="large" tip="Loading preview..." />
          </div>
        )}
      </Drawer>
    </div>
  );
};

export default IngestPage;
