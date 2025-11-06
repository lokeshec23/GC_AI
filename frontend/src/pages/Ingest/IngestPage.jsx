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
} from "@ant-design/icons";
import { ingestAPI, settingsAPI } from "../../services/api";

const { TextArea } = Input;
const { Option } = Select;

// ✅ Default prompt
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
  const [excelReady, setExcelReady] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSupportedModels();

    // Set initial form values
    form.setFieldsValue({
      model_provider: "gemini",
      model_name: "gemini-2.5-flash-preview-05-20",
      custom_prompt: DEFAULT_PROMPT,
    });
  }, [form]);

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

  const handleSubmit = async (values) => {
    if (!file) {
      message.error("Please upload a PDF file");
      return;
    }

    try {
      setProcessing(true);
      setProgress(0);
      setProgressMessage("Initializing...");
      setPreviewData(null);
      setExcelReady(false);

      // Create FormData
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model_provider", values.model_provider);
      formData.append("model_name", values.model_name);
      formData.append("custom_prompt", values.custom_prompt);

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
          message.success("Processing complete!");

          // ✅ Fetch preview data and mark Excel as ready
          fetchPreviewData(session_id);
          setExcelReady(true);
        }
      };

      eventSource.onerror = (error) => {
        console.error("SSE Error:", error);
        eventSource.close();
        setProcessing(false);
        message.error("Connection lost. Please check status manually.");
      };
    } catch (error) {
      setProcessing(false);
      console.error("Submit error:", error);
      message.error(error.response?.data?.detail || "Processing failed");
    }
  };

  // ✅ Fetch preview data
  const fetchPreviewData = async (sid) => {
    try {
      const response = await ingestAPI.getPreview(sid);
      setPreviewData(response.data);
    } catch (error) {
      console.error("Failed to fetch preview:", error);
      message.error("Failed to load preview data");
    }
  };

  // ✅ Handle Excel download
  const handleDownload = () => {
    if (sessionId) {
      message.loading("Preparing download...", 0.5);
      ingestAPI.downloadExcel(sessionId);
    }
  };

  // ✅ Convert JSON to table data
  const convertToTableData = (data) => {
    const rows = [];
    let rowId = 0;

    const processObject = (obj, sectionName = "") => {
      for (const [key, value] of Object.entries(obj)) {
        if (key === "summary") {
          rows.push({
            key: rowId++,
            section: sectionName,
            subsection: "Summary",
            details: value,
            isHeader: true,
          });
        } else if (typeof value === "string") {
          rows.push({
            key: rowId++,
            section: sectionName,
            subsection: key,
            details: value,
            isHeader: false,
          });
        } else if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          processObject(value, key);
        } else if (Array.isArray(value)) {
          rows.push({
            key: rowId++,
            section: sectionName,
            subsection: key,
            details: JSON.stringify(value, null, 2),
            isHeader: false,
          });
        }
      }
    };

    processObject(data);
    return rows;
  };

  const tableColumns = [
    {
      title: "Section",
      dataIndex: "section",
      key: "section",
      width: "20%",
      render: (text, record) => (
        <span className={record.isHeader ? "font-bold text-blue-700" : ""}>
          {text}
        </span>
      ),
    },
    {
      title: "Subsection/Rule",
      dataIndex: "subsection",
      key: "subsection",
      width: "25%",
      render: (text, record) => (
        <span className={record.isHeader ? "font-bold text-blue-700" : ""}>
          {text}
        </span>
      ),
    },
    {
      title: "Details",
      dataIndex: "details",
      key: "details",
      width: "55%",
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
        <Card className="mb-6">
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

              {/* Prompt Text Area */}
              <TextArea
                placeholder="Enter your extraction prompt here..."
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
            💡 <span>Attach a PDF file and click Send to start processing</span>
          </div>
        </Card>
      </Form>

      {/* Progress Section */}
      {processing && (
        <Card title="⚡ Processing Status" className="mb-6">
          <Progress
            percent={progress}
            status={progress === 100 ? "success" : "active"}
            strokeColor={{
              "0%": "#108ee9",
              "100%": "#87d068",
            }}
          />
          <p className="mt-4 text-gray-600">{progressMessage}</p>
        </Card>
      )}

      {/* ✅ Excel Preview Section */}
      {!processing && excelReady && previewData && (
        <Card
          className="mb-6"
          title={
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-lg">
                <FileExcelOutlined className="text-green-600" />
                <strong>Extraction Results</strong>
              </span>
              <Button
                type="primary"
                icon={<DownloadOutlined />}
                size="large"
                onClick={handleDownload}
              >
                Download Excel
              </Button>
            </div>
          }
        >
          <Divider orientation="left">
            <EyeOutlined /> Preview
          </Divider>

          <div className="bg-gray-50 p-4 rounded-lg">
            <Table
              columns={tableColumns}
              dataSource={convertToTableData(previewData)}
              pagination={{
                pageSize: 20,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} rows`,
              }}
              scroll={{ y: 500, x: "max-content" }}
              size="small"
              bordered
              className="shadow-sm"
              rowClassName={(record) => (record.isHeader ? "bg-blue-50" : "")}
            />
          </div>

          <Divider />

          <div className="flex justify-center">
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              size="large"
              onClick={handleDownload}
              className="px-8"
            >
              Download Excel File
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

export default IngestPage;
