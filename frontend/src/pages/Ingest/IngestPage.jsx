import React, { useState, useEffect } from "react";
import {
  Card,
  Form,
  Select,
  Upload,
  Button,
  Input,
  message,
  Progress,
  Alert,
  Space,
  Tag,
  Divider,
} from "antd";
import {
  UploadOutlined,
  SendOutlined,
  FileTextOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { ingestAPI, settingsAPI } from "../../services/api";

const { TextArea } = Input;
const { Option } = Select;

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

  useEffect(() => {
    fetchSupportedModels();
  }, []);

  const fetchSupportedModels = async () => {
    try {
      const response = await settingsAPI.getSupportedModels();
      setSupportedModels(response.data);
    } catch (error) {
      message.error("Failed to load supported models");
    }
  };

  const handleFileChange = ({ file }) => {
    if (file.status !== "uploading") {
      setFile(file.originFileObj);
    }
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
      message.error(error.response?.data?.detail || "Processing failed");
    }
  };

  const handleDownload = () => {
    if (sessionId) {
      ingestAPI.downloadResult(sessionId);
    }
  };

  const defaultPrompt = `You are an expert mortgage guideline analyst.
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

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        initialValues={{
          model_provider: "openai",
          model_name: "gpt-4o",
          custom_prompt: defaultPrompt,
        }}
      >
        {/* Model Selection */}
        <Card
          title={
            <>
              <ThunderboltOutlined /> Select Model
            </>
          }
          className="mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item
              label="Model Provider"
              name="model_provider"
              rules={[{ required: true, message: "Please select a provider" }]}
            >
              <Select
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
              label="Model Name"
              name="model_name"
              rules={[{ required: true, message: "Please select a model" }]}
            >
              <Select>
                {supportedModels[selectedProvider]?.map((model) => (
                  <Option key={model} value={model}>
                    {model}
                  </Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Alert
            message="Make sure you've configured your API key in Settings"
            type="info"
            showIcon
            className="mt-2"
          />
        </Card>

        {/* File Upload */}
        <Card title="📄 Upload PDF" className="mb-6">
          <Form.Item
            name="file"
            rules={[{ required: true, message: "Please upload a PDF file" }]}
          >
            <Upload
              accept=".pdf"
              maxCount={1}
              beforeUpload={() => false}
              onChange={handleFileChange}
            >
              <Button icon={<UploadOutlined />} size="large" block>
                Choose PDF File
              </Button>
            </Upload>
          </Form.Item>

          {file && (
            <Alert
              message={`Selected: ${file.name} (${(
                file.size /
                1024 /
                1024
              ).toFixed(2)} MB)`}
              type="success"
              showIcon
            />
          )}
        </Card>

        {/* Custom Prompt */}
        <Card title="✍️ Custom Extraction Prompt" className="mb-6">
          <Form.Item
            name="custom_prompt"
            rules={[{ required: true, message: "Please enter a prompt" }]}
          >
            <TextArea
              rows={12}
              placeholder="Enter your extraction prompt here..."
              className="font-mono text-sm"
            />
          </Form.Item>

          <Alert
            message="Tip: Be specific about the structure and format you want in the output"
            type="info"
            showIcon
          />
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end mb-6">
          <Button
            type="primary"
            htmlType="submit"
            icon={<SendOutlined />}
            size="large"
            loading={processing}
            disabled={processing}
          >
            {processing ? "Processing..." : "Start Processing"}
          </Button>
        </div>
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
        <Card title="✅ Processing Complete" className="mb-6">
          <Alert
            message="Your extraction is ready!"
            description="Click the button below to download the Excel file with extracted rules."
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
