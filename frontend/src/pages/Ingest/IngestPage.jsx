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

// ✅ Default prompt as constant
const DEFAULT_PROMPT = `You are an expert U.S. mortgage underwriting analyst. 
You will be given text from a mortgage guideline document.
Your job is to extract and structure it into a clean table format.

INSTRUCTIONS:
1. Identify major sections and subsections based on titles, numbering, or formatting.
2. For each major section, write a short 2–3 line summary.
3. For each subsection, summarize the rules, requirements, or eligibility criteria in 2–3 lines.
4. Keep all section and subsection titles exactly as written in the original text.
5. Do not add, guess, or infer information not directly present.
6. Maintain the original hierarchy and document order.

OUTPUT FORMAT:
Provide a markdown table with these columns:

| Major Section Title | Subsection Title | Summary / Key Requirements |
|---------------------|------------------|----------------------------|
| (Section name) | (Subsection or blank) | (2-3 sentence summary) |

Example:
| Major Section Title | Subsection Title | Summary / Key Requirements |
|---------------------|------------------|----------------------------|
| 301. Non-U.S. Citizen Eligibility | | This section covers eligibility requirements for non-U.S. citizens applying for mortgage loans. |
| 301. Non-U.S. Citizen Eligibility | Work Permit Requirements | Borrower must have valid work permit or visa. Minimum 3 years of work history required. |

Output ONLY the table. No additional text before or after.`;

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
  const [selectedProvider, setSelectedProvider] = useState("gemini");
  const [previewData, setPreviewData] = useState(null);

  // ✅ State for prompt (allows user to edit)
  const [promptValue, setPromptValue] = useState(DEFAULT_PROMPT);

  // ✅ Modal states
  const [processingModalVisible, setProcessingModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);

  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSupportedModels();

    // ✅ Set initial form values including prompt
    form.setFieldsValue({
      model_provider: "gemini",
      model_name: "gemini-2.5-flash-preview-05-20",
      custom_prompt: DEFAULT_PROMPT,
    });

    // ✅ Set prompt state
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

  // ✅ Reset prompt to default
  const handleResetPrompt = () => {
    setPromptValue(DEFAULT_PROMPT);
    form.setFieldsValue({ custom_prompt: DEFAULT_PROMPT });
    message.success("Prompt reset to default");
  };

  // ✅ Handle prompt change
  const handlePromptChange = (e) => {
    setPromptValue(e.target.value);
  };

  const handleSubmit = async (values) => {
    if (!file) {
      message.error("Please upload a PDF file");
      return;
    }

    // ✅ Use current prompt value (user's custom or default)
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

      // Create FormData
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model_provider", values.model_provider);
      formData.append("model_name", values.model_name);
      formData.append("custom_prompt", currentPrompt); // ✅ Use current prompt

      console.log(
        "Submitting with prompt:",
        currentPrompt.substring(0, 100) + "..."
      );

      // Start processing
      const response = await ingestAPI.ingestGuideline(formData);
      const { session_id } = response.data;
      setSessionId(session_id);

      message.success("Processing started!");

      // Connect to progress stream
      const eventSource = ingestAPI.createProgressStream(session_id);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress);
        setProgressMessage(data.message);

        if (data.progress >= 100) {
          eventSource.close();
          setProcessing(false);
          setProcessingModalVisible(false);

          // Fetch preview data
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

  // ✅ Fetch preview data and show modal
  const fetchPreviewData = async (sid) => {
    try {
      const response = await ingestAPI.getPreview(sid);
      console.log("Preview data received:", response.data);
      setPreviewData(response.data);
      setPreviewModalVisible(true);
    } catch (error) {
      console.error("Failed to fetch preview:", error);
      message.error("Failed to load preview data");
    }
  };

  // ✅ Handle Excel download
  const handleDownload = () => {
    if (sessionId) {
      message.success("Downloading Excel file...");
      ingestAPI.downloadExcel(sessionId);
    }
  };

  // ✅ Close preview modal
  const handleClosePreview = () => {
    setPreviewModalVisible(false);
    setPreviewData(null);
    setSessionId(null);
  };

  // ✅ Convert preview data to table rows
  const convertToTableData = (data) => {
    if (!data || typeof data !== "object") {
      console.log("Invalid preview data:", data);
      return [];
    }

    const rows = [];
    let rowId = 0;

    // Handle array format (from table parser)
    if (Array.isArray(data)) {
      console.log("Converting array data, length:", data.length);
      return data.map((item, idx) => ({
        key: idx,
        major_section: item.major_section || "",
        subsection: item.subsection || "",
        summary: item.summary || "",
      }));
    }

    // Handle object format
    console.log("Converting object data, keys:", Object.keys(data));
    for (const [section, content] of Object.entries(data)) {
      if (
        typeof content === "object" &&
        content !== null &&
        !Array.isArray(content)
      ) {
        // Add section header
        rows.push({
          key: rowId++,
          major_section: section,
          subsection: "",
          summary: content.summary || "",
        });

        // Add subsections
        for (const [key, value] of Object.entries(content)) {
          if (key !== "summary") {
            rows.push({
              key: rowId++,
              major_section: "",
              subsection: key,
              summary:
                typeof value === "string" ? value : JSON.stringify(value),
            });
          }
        }
      } else {
        rows.push({
          key: rowId++,
          major_section: section,
          subsection: "",
          summary: String(content),
        });
      }
    }

    console.log("Converted rows:", rows.length);
    return rows;
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

        {/* ChatGPT-Style Prompt Box */}
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
              {/* Hidden File Input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                style={{ display: "none" }}
                disabled={processing}
              />

              {/* ✅ Controlled Prompt Text Area */}
              <TextArea
                value={promptValue}
                onChange={handlePromptChange}
                placeholder="Enter your extraction prompt here... (You can edit or clear this prompt)"
                className="font-mono text-sm resize-none pr-24"
                style={{
                  minHeight: "320px",
                  paddingBottom: "60px",
                }}
                disabled={processing}
              />

              {/* File Upload + Send Button Container */}
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
            💡{" "}
            <span>
              You can edit the prompt above or use the default. Attach a PDF and
              click Send to start.
            </span>
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

      {/* ✅ Preview Modal - Fixed Pagination */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-lg">
            <FileExcelOutlined className="text-green-600" />
            <span className="font-semibold">Extraction Results</span>
          </div>
        }
        open={previewModalVisible}
        onCancel={handleClosePreview}
        width={1400}
        centered
        footer={[
          <Button key="close" onClick={handleClosePreview} size="large">
            Close
          </Button>,
          <Button
            key="download"
            type="primary"
            icon={<DownloadOutlined />}
            onClick={handleDownload}
            size="large"
          >
            Download Excel
          </Button>,
        ]}
        bodyStyle={{ padding: "24px" }}
      >
        {previewData ? (
          <div>
            <div className="mb-4 p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-sm text-green-800 flex items-center gap-2">
                <EyeOutlined />
                <span>
                  Preview of extracted data. Click{" "}
                  <strong>Download Excel</strong> to save the file.
                </span>
              </p>
            </div>

            {/* ✅ Fixed Table with proper pagination */}
            <Table
              columns={tableColumns}
              dataSource={convertToTableData(previewData)}
              pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                pageSizeOptions: ["10", "20", "50", "100"],
                showTotal: (total, range) =>
                  `${range[0]}-${range[1]} of ${total} rows`,
              }}
              scroll={{ x: "max-content" }}
              size="small"
              bordered
              rowClassName={(record) =>
                record.major_section && !record.subsection
                  ? "bg-blue-50 font-semibold"
                  : ""
              }
            />
          </div>
        ) : (
          <div className="text-center py-12">
            <Spin size="large" />
            <p className="mt-4 text-gray-500">Loading preview...</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default IngestPage;
