import React, { useState, useEffect, useRef } from "react";
import {
  Card,
  Form,
  Select,
  Button,
  Input,
  message,
  Progress,
  Alert,
  Space,
  Tag,
} from "antd";
import {
  PaperClipOutlined,
  SendOutlined,
  FileTextOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  CloseCircleOutlined,
} from "@ant-design/icons";
import { ingestAPI, settingsAPI } from "../../services/api";

const { TextArea } = Input;
const { Option } = Select;

// ✅ Move default prompt OUTSIDE component
const DEFAULT_PROMPT = `You are an expert mortgage guideline analyst.
Extract all rules, eligibility criteria, and conditions from this mortgage guideline document.

### INSTRUCTIONS
1. Identify major sections and subsections
2. For each major section, provide a brief summary
3. Extract specific rules, conditions, and requirements
4. Maintain the hierarchical structure
5. Output in JSON format

### OUTPUT FORMAT
{
  "Section Title": {
    "summary": "Brief description of this section",
    "Subsection Title": "Key rules and conditions"
  }
}

Only extract information explicitly stated in the document.`;

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
  const fileInputRef = useRef(null); // ✅ Add ref for file input

  useEffect(() => {
    fetchSupportedModels();

    // Set initial form values
    form.setFieldsValue({
      model_provider: "openai",
      model_name: "gpt-4o",
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

  // ✅ Fixed file handler - use native input
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

    console.log("Submitting with values:", values);
    console.log("File:", file);

    try {
      setProcessing(true);
      setProgress(0);
      setProgressMessage("Initializing...");

      // Create FormData
      const formData = new FormData();
      formData.append("file", file);
      formData.append("model_provider", values.model_provider);
      formData.append("model_name", values.model_name);
      formData.append("custom_prompt", values.custom_prompt);

      // Debug: Log FormData contents
      console.log("FormData contents:");
      for (let pair of formData.entries()) {
        console.log(pair[0], pair[1]);
      }

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
      console.error("Error response:", error.response?.data);
      message.error(error.response?.data?.detail || "Processing failed");
    }
  };

  const handleDownload = () => {
    if (sessionId) {
      ingestAPI.downloadResult(sessionId);
    }
  };

  return (
    <div className="max-w-5xl mx-auto">
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

              {/* File Upload + Send Button Container (Bottom Right) */}
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                {/* File Attachment */}
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

                {/* Send Button */}
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

          {/* Tip at bottom */}
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

      {/* Download Section */}
      {!processing && sessionId && progress === 100 && (
        <Card className="mb-6">
          <Alert
            message="✅ Processing Complete!"
            description="Your extraction is ready. Click below to download the Excel file."
            type="success"
            showIcon
            className="mb-4"
          />

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            size="large"
            onClick={handleDownload}
            block
          >
            Download Excel File
          </Button>
        </Card>
      )}
    </div>
  );
};

export default IngestPage;
