import React, { useEffect, useState } from "react";
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Space,
  Tag,
  message,
  Spin,
  Collapse,
  Divider,
  Tooltip,
} from "antd";
import {
  SaveOutlined,
  KeyOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  FileOutlined,
  InfoCircleOutlined,
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
    // ✅ Use a single async function to initialize the page
    const initializePage = async () => {
      await fetchSupportedModels(); // Fetch models first
      await fetchSettings(); // Then fetch user settings
    };

    initializePage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchSettings = async () => {
    try {
      setFetching(true);
      const response = await settingsAPI.getSettings();
      // ✅ Handle both array and string for stop_sequences
      const stopSequences = Array.isArray(response.data.stop_sequences)
        ? response.data.stop_sequences.join(", ")
        : response.data.stop_sequences;

      form.setFieldsValue({
        ...response.data,
        stop_sequences: stopSequences,
      });
    } catch (error) {
      if (error.response?.status === 404) {
        message.info(
          "No settings found. Please configure your API keys to begin."
        );
        // ✅ Set all default values when no settings are found
        form.setFieldsValue({
          temperature: 0.7,
          max_output_tokens: 8192,
          top_p: 1.0,
          pages_per_chunk: 1, // ✅ Use new page-based chunking
          stop_sequences: "",
        });
      } else {
        message.error("Failed to load settings. Please try again.");
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
    // ✅ Convert comma-separated string to array for stop_sequences
    const payload = {
      ...values,
      stop_sequences: values.stop_sequences
        ? values.stop_sequences
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    };

    try {
      setLoading(true);
      await settingsAPI.updateSettings(payload);
      message.success("Settings saved successfully!");
    } catch (error) {
      message.error(error.response?.data?.detail || "Failed to save settings");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-full">
        <Spin size="large" tip="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-poppins text-gray-800 flex items-center gap-3">
          <SettingOutlined />
          Settings
        </h1>
        <p className="text-gray-500 mt-2 text-base">
          Configure your API keys and processing parameters for all features.
        </p>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="space-y-6"
      >
        {/* API Keys & Credentials */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <KeyOutlined />
              <span className="font-semibold">API Keys & Credentials</span>
            </div>
          }
        >
          <Collapse accordion defaultActiveKey={["1"]}>
            <Panel
              header={
                <span className="font-semibold">
                  Azure OpenAI Configuration
                </span>
              }
              key="1"
            >
              <Form.Item label="API Key" name="openai_api_key">
                <Input.Password
                  placeholder="Enter your Azure OpenAI API key"
                  prefix={<KeyOutlined />}
                  className="font-mono"
                />
              </Form.Item>
              <Form.Item label="Endpoint" name="openai_endpoint">
                <Input
                  placeholder="https://your-resource.openai.azure.com/"
                  prefix={<KeyOutlined />}
                  className="font-mono"
                />
              </Form.Item>
              <Form.Item label="Deployment Name" name="openai_deployment">
                <Input
                  placeholder="e.g., extraction-model, gpt4o-deployment"
                  prefix={<ThunderboltOutlined />}
                  className="font-mono"
                />
              </Form.Item>
            </Panel>
            <Panel
              header={
                <span className="font-semibold">
                  Google Gemini Configuration
                </span>
              }
              key="2"
            >
              <Form.Item label="API Key" name="gemini_api_key">
                <Input.Password
                  placeholder="Enter your Google Gemini API key"
                  prefix={<KeyOutlined />}
                  className="font-mono"
                />
              </Form.Item>
            </Panel>
          </Collapse>
        </Card>

        {/* ✅ PDF Chunking Strategy (Replaced old chunking) */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <FileOutlined />
              <span className="font-semibold">PDF Chunking Strategy</span>
            </div>
          }
        >
          <div className="grid grid-cols-1">
            <Form.Item
              label="Pages Per Chunk"
              name="pages_per_chunk"
              tooltip="Number of PDF pages to process in a single API call to the LLM."
              rules={[{ required: true, message: "This field is required" }]}
            >
              <InputNumber
                min={1}
                max={50}
                className="w-full"
                placeholder="Default: 1"
                size="large"
              />
            </Form.Item>
          </div>
        </Card>

        {/* LLM Parameters */}
        <Card
          title={
            <div className="flex items-center gap-2">
              <ThunderboltOutlined />
              <span className="font-semibold">LLM Generation Parameters</span>
            </div>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
            <Form.Item
              label="Temperature"
              name="temperature"
              tooltip="Controls randomness. Lower is more focused, higher is more creative."
            >
              <InputNumber min={0} max={2} step={0.1} className="w-full" />
            </Form.Item>
            <Form.Item
              label="Max Output Tokens"
              name="max_output_tokens"
              tooltip="Maximum length of the generated response."
            >
              <InputNumber
                min={1024}
                max={128000}
                step={1024}
                className="w-full"
              />
            </Form.Item>
            <Form.Item
              label="Top P"
              name="top_p"
              tooltip="Controls the diversity of the response."
            >
              <InputNumber min={0} max={1} step={0.1} className="w-full" />
            </Form.Item>
            <Form.Item
              label="Stop Sequences (comma-separated)"
              name="stop_sequences"
              tooltip="Text sequences that will cause the model to stop generating."
            >
              <Input placeholder="e.g., ###, END_OF_RESPONSE" />
            </Form.Item>
          </div>
        </Card>

        {/* Save Button */}
        <div className="flex justify-end mt-8">
          <Space>
            <Button onClick={() => form.resetFields()} size="large">
              Reset Fields
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={loading}
              size="large"
            >
              Save All Settings
            </Button>
          </Space>
        </div>
      </Form>
    </div>
  );
};

export default SettingsPage;
