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
  PaperClipOutlined,
  SendOutlined,
  FileTextOutlined,
  DownloadOutlined,
  CloseCircleOutlined,
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
  const sseRef = useRef(null);

  useEffect(() => {
    fetchSupportedModels();

    form.setFieldsValue({
      model_provider: "openai",
      model_name: "gpt-4o",
      custom_prompt: DEFAULT_PROMPT,
    });

    setPromptValue(DEFAULT_PROMPT);

    return () => {
      // cleanup SSE on unmount if still open
      try {
        sseRef.current?.close?.();
      } catch {}
    };
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
      sseRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress);
        setProgressMessage(data.message);

        if (data.progress >= 100) {
          eventSource.close();
          setProcessing(false);
          setProcessingModalVisible(false);
          fetchPreviewData(session_id);
          sseRef.current = null;
          message.success("Processing complete!");
        }
      };

      eventSource.onerror = (error) => {
        // graceful failure
        console.error("SSE Error:", error);
        try {
          eventSource.close();
        } catch {}
        setProcessing(false);
        setProcessingModalVisible(false);
        message.error("Connection lost. Please check status manually.");
        sseRef.current = null;
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
    } else {
      message.warning("No session to download from");
    }
  };

  const handleClosePreview = () => {
    setPreviewModalVisible(false);
    setPreviewData(null);
    setSessionId(null);
  };

  const convertToTableData = (data) => {
    if (!data || !Array.isArray(data)) return [];
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
        {/* Prompt + Controls Card */}
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
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            hidden
            disabled={processing}
          />

          {/* Full-width prompt */}
          <Form.Item
            name="custom_prompt"
            rules={[{ required: true, message: "Please enter a prompt" }]}
            className="mb-0"
          >
            <TextArea
              value={promptValue}
              onChange={handlePromptChange}
              placeholder="Enter your extraction prompt here..."
              className="font-mono text-sm resize-none"
              style={{ minHeight: "420px", width: "100%" }}
              disabled={processing}
            />
          </Form.Item>

          {/* Bottom Controls */}
          <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
            {/* Provider + Model */}
            <Space wrap>
              <Form.Item
                name="model_provider"
                noStyle
                rules={[{ required: true, message: "Select provider" }]}
              >
                <Select
                  size="large"
                  style={{ width: 180 }}
                  onChange={(value) => {
                    setSelectedProvider(value);
                    form.setFieldsValue({
                      model_name: supportedModels[value]?.[0],
                    });
                  }}
                >
                  <Option value="openai">OpenAI</Option>
                  <Option value="gemini">Google Gemini</Option>
                </Select>
              </Form.Item>

              <Form.Item
                name="model_name"
                noStyle
                rules={[{ required: true, message: "Select model" }]}
              >
                <Select size="large" style={{ width: 220 }}>
                  {supportedModels[selectedProvider]?.map((model) => (
                    <Option key={model} value={model}>
                      {model}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Space>

            {/* File + Send */}
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
                  className="flex items-center gap-2"
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
                className="flex items-center gap-2"
              >
                {processing ? "Processing..." : "Send"}
              </Button>
            </Space>
          </div>

          <div className="mt-3 text-xs text-gray-500 flex items-center gap-2">
            💡 <span>Attach a PDF file and click Send to start processing</span>
          </div>
        </Card>
      </Form>

      {/* Processing Modal (restored) */}
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

      {/* Preview as centered Modal (90% width/height, no outside close) */}
      <Modal
        open={previewModalVisible}
        footer={null}
        closable={false}
        centered
        width="90vw"
        style={{ top: "5vh", padding: 0 }}
        maskClosable={false}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <FileExcelOutlined className="text-green-600 text-xl" />
            <span className="font-semibold text-lg">Extraction Results</span>
            <Tag color="blue">
              {convertToTableData(previewData).length} rows
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

        {/* Body */}
        <div
          style={{
            height: "calc(90vh - 76px)", // header ~76px
            overflowY: "auto",
            padding: "16px 24px",
          }}
        >
          {previewData ? (
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
              scroll={{ x: "max-content" }}
              size="small"
              bordered
              sticky
              rowClassName={(record) =>
                record.major_section && !record.subsection
                  ? "bg-blue-50 font-semibold"
                  : ""
              }
            />
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
