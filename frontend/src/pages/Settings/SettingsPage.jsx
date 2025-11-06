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
        initialValues={{
          temperature: 0.7,
          max_output_tokens: 4096,
          top_p: 1.0,
          chunk_size: 7000,
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
              tooltip="Maximum length of generated response"
              rules={[{ required: true }]}
            >
              <InputNumber
                min={1}
                max={128000}
                step={256}
                className="w-full"
                placeholder="4096"
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
        <Card title="📄 PDF Processing" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item
              label="Chunk Size (tokens)"
              name="chunk_size"
              tooltip="Size of each text chunk for processing"
              rules={[{ required: true }]}
            >
              <InputNumber
                min={1000}
                max={100000}
                step={1000}
                className="w-full"
                placeholder="7000"
              />
            </Form.Item>

            <Form.Item
              label="Chunk Overlap (tokens)"
              name="chunk_overlap"
              tooltip="Overlap between chunks for context preservation"
              rules={[{ required: true }]}
            >
              <InputNumber
                min={0}
                max={1000}
                step={50}
                className="w-full"
                placeholder="200"
              />
            </Form.Item>
          </div>
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
