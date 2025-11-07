import React, { useEffect, useState } from "react";
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Divider,
  Space,
  Tag,
  message,
  Spin,
  Collapse,
  Alert,
} from "antd";
import {
  SaveOutlined,
  KeyOutlined,
  SettingOutlined,
  ThunderboltOutlined,
} from "@ant-design/icons";
import { settingsAPI } from "../../services/api";

const { Panel } = Collapse;

const SettingsPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [supportedModels, setSupportedModels] = useState({
    openai: [],
    gemini: [],
  });

  useEffect(() => {
    fetchSettings();
    fetchSupportedModels();
  }, []);

  const fetchSettings = async () => {
    try {
      setFetching(true);
      const response = await settingsAPI.getSettings();
      form.setFieldsValue(response.data);
    } catch (error) {
      if (error.response?.status === 404) {
        message.info("No settings found. Using default values.");
      } else {
        message.error("Failed to load settings");
      }
    } finally {
      setFetching(false);
    }
  };

  const fetchSupportedModels = async () => {
    try {
      const response = await settingsAPI.getSupportedModels();
      setSupportedModels(response.data);
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  };

  const handleSubmit = async (values) => {
    try {
      setLoading(true);
      await settingsAPI.updateSettings(values);
      message.success("Settings saved successfully!");
    } catch (error) {
      message.error(error.response?.data?.detail || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-96">
        <Spin size="large" tip="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <SettingOutlined />
          Settings
        </h1>
        <p className="text-gray-600 mt-2">
          Configure your API keys and LLM parameters for guideline processing
        </p>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        // In SettingsPage.jsx initialValues
        initialValues={{
          temperature: 0.7,
          max_output_tokens: 8192,
          top_p: 1.0,
          chunk_size: 1500, // ✅ Default to safe value for Gemini Flash
          chunk_overlap: 200,
          stop_sequences: [],
        }}
      >
        {/* API Keys Section */}
        <Card
          title={
            <>
              <KeyOutlined /> API Keys
            </>
          }
          className="mb-6"
        >
          <Form.Item
            label="OpenAI API Key"
            name="openai_api_key"
            rules={[{ required: false }]}
          >
            <Input.Password
              placeholder="sk-..."
              prefix={<KeyOutlined />}
              className="font-mono"
            />
          </Form.Item>

          <Form.Item
            label="Gemini API Key"
            name="gemini_api_key"
            rules={[{ required: false }]}
          >
            <Input.Password
              placeholder="AIza..."
              prefix={<KeyOutlined />}
              className="font-mono"
            />
          </Form.Item>

          <div className="bg-blue-50 p-3 rounded">
            <p className="text-sm text-blue-800">
              <strong>Supported Models:</strong>
            </p>
            <div className="mt-2">
              <div className="mb-2">
                <span className="font-semibold text-sm">OpenAI: </span>
                {supportedModels.openai.map((model) => (
                  <Tag key={model} color="blue" className="mb-1">
                    {model}
                  </Tag>
                ))}
              </div>
              <div>
                <span className="font-semibold text-sm">Gemini: </span>
                {supportedModels.gemini.map((model) => (
                  <Tag key={model} color="green" className="mb-1">
                    {model}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* LLM Parameters Section */}
        <Card
          title={
            <>
              <ThunderboltOutlined /> LLM Parameters
            </>
          }
          className="mb-6"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item
              label="Temperature"
              name="temperature"
              tooltip="Controls randomness. Lower = more focused, Higher = more creative"
              rules={[{ required: true }]}
            >
              <InputNumber
                min={0}
                max={2}
                step={0.1}
                className="w-full"
                placeholder="0.7"
              />
            </Form.Item>

            <Form.Item
              label="Max Output Tokens"
              name="max_output_tokens"
              tooltip="Maximum length of generated response. Gemini needs higher values (8192+) due to thinking tokens."
              rules={[{ required: true }]}
              extra={
                <span className="text-xs text-orange-600">
                  ⚠️ For Gemini models, use at least 8192 tokens to avoid
                  truncation
                </span>
              }
            >
              <InputNumber
                min={1000}
                max={128000}
                step={1024}
                className="w-full"
                placeholder="8192"
              />
            </Form.Item>

            <Form.Item
              label="Top P"
              name="top_p"
              tooltip="Nucleus sampling parameter"
              rules={[{ required: true }]}
            >
              <InputNumber
                min={0}
                max={1}
                step={0.1}
                className="w-full"
                placeholder="1.0"
              />
            </Form.Item>
          </div>

          <Collapse ghost className="mt-4">
            <Panel header="Advanced Options" key="advanced">
              <Form.Item
                label="Stop Sequences (comma-separated)"
                name="stop_sequences"
                tooltip="Sequences where the API will stop generating"
              >
                <Input placeholder="e.g., END, STOP" />
              </Form.Item>
            </Panel>
          </Collapse>
        </Card>

        {/* PDF Processing Section */}
        {/* PDF Processing Section */}
        <Card title="📄 PDF Processing & Text Chunking" className="mb-6">
          {/* <Alert
            message="Chunking Strategy"
            description="Text is split into chunks for LLM processing. Smaller chunks = more API calls but safer. Larger chunks = fewer calls but may hit token limits."
            type="info"
            showIcon
            className="mb-4"
          /> */}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item
              label="Chunk Size (tokens)"
              name="chunk_size"
              tooltip="Maximum tokens per chunk. Leave at default for auto-calculation based on model."
              extra={
                <div className="text-xs mt-1">
                  <div className="font-semibold mb-1">
                    Recommended by model:
                  </div>
                  <ul className="list-disc list-inside space-y-1">
                    <li>
                      <strong>Gemini 2.5 Flash:</strong> 1500 tokens (due to
                      thinking overhead)
                    </li>
                    <li>
                      <strong>Gemini 2.5 Pro:</strong> 8000 tokens (larger
                      context)
                    </li>
                    <li>
                      <strong>GPT-4o:</strong> 4000 tokens (balanced)
                    </li>
                    <li>
                      <strong>GPT-4:</strong> 2000 tokens (smaller limit)
                    </li>
                  </ul>
                </div>
              }
              rules={[{ required: true }]}
            >
              <InputNumber
                min={500}
                max={10000}
                step={500}
                className="w-full"
                placeholder="Auto (recommended)"
              />
            </Form.Item>

            <Form.Item
              label="Chunk Overlap (tokens)"
              name="chunk_overlap"
              tooltip="Overlap between consecutive chunks to maintain context"
              extra={
                <span className="text-xs text-gray-600">
                  Recommended: 200-300 tokens for smooth transitions
                </span>
              }
              rules={[{ required: true }]}
            >
              <InputNumber
                min={0}
                max={500}
                step={50}
                className="w-full"
                placeholder="200"
              />
            </Form.Item>
          </div>

          {/* <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <ThunderboltOutlined />
              How Chunking Works
            </h4>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>
                <strong>OCR extracts text</strong> from PDF (30 pages at a time
                for speed)
              </li>
              <li>
                <strong>Text is split</strong> into chunks based on your
                settings above
              </li>
              <li>
                <strong>Each chunk is sent</strong> to the LLM separately
              </li>
              <li>
                <strong>Results are merged</strong> into final Excel output
              </li>
            </ol>

            <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded">
              <p className="text-xs text-yellow-800">
                ⚠️ <strong>Note:</strong> If you get "token limit exceeded"
                errors, reduce the chunk size. For Gemini Flash models, use 1500
                tokens or less.
              </p>
            </div>
          </div> */}
        </Card>
        {/* Submit Button */}
        <div className="flex justify-end">
          <Space>
            <Button onClick={() => form.resetFields()}>Reset</Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={loading}
              size="large"
            >
              Save Settings
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default SettingsPage;
