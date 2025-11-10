import React, { useEffect, useState } from "react";
import {
  Card,
  Form,
  Input,
  InputNumber,
  Button,
  Space,
  message,
  Spin,
  Tabs,
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

const { Password } = Input;
const { TabPane } = Tabs;

const SettingsPage = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setFetching(true);
      const response = await settingsAPI.getSettings();

      const stopSequences = Array.isArray(response.data.stop_sequences)
        ? response.data.stop_sequences.join(", ")
        : response.data.stop_sequences || "";

      form.setFieldsValue({
        ...response.data,
        stop_sequences: stopSequences,
      });
    } catch (error) {
      if (error.response?.status === 404) {
        form.setFieldsValue({
          temperature: 0.5,
          max_output_tokens: 8192,
          top_p: 1.0,
          pages_per_chunk: 1,
          stop_sequences: "",
        });
        message.info("No existing settings found. Configure to get started.");
      } else {
        message.error("Unable to load settings.");
      }
    } finally {
      setFetching(false);
    }
  };

  const handleSubmit = async (values) => {
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

      alert("✅ Settings updated successfully!");
    } catch (error) {
      alert(error.response?.data?.detail || "❌ Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <Spin size="large" tip="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-4 md:px-8 pb-14">
      <div className="mb-10">
        <h1 className="text-3xl font-bold flex items-center gap-2 text-gray-800">
          <SettingOutlined /> Settings
        </h1>
        <p className="text-gray-600 mt-1 text-base">
          Configure your API keys and extraction behavior.
        </p>
      </div>

      <Form
        form={form}
        layout="vertical"
        onFinish={handleSubmit}
        className="space-y-10"
      >
        <Card
          className="shadow-sm"
          title={
            <div className="flex items-center gap-2">
              <KeyOutlined /> API Keys & Credentials
            </div>
          }
        >
          <Tabs defaultActiveKey="openai">
            <TabPane tab="Azure OpenAI" key="openai">
              <Form.Item label="API Key" name="openai_api_key">
                <Password
                  placeholder="Enter Azure OpenAI API Key"
                  className="font-mono"
                />
              </Form.Item>
              <Form.Item label="Endpoint" name="openai_endpoint">
                <Input
                  placeholder="https://your-resource.openai.azure.com"
                  className="font-mono"
                />
              </Form.Item>
              <Form.Item label="Deployment Name" name="openai_deployment">
                <Input
                  placeholder="e.g., gpt4o-deployment"
                  className="font-mono"
                />
              </Form.Item>
            </TabPane>

            <TabPane tab="Google Gemini" key="gemini">
              <Form.Item label="API Key" name="gemini_api_key">
                <Password
                  placeholder="Enter Google Gemini API Key"
                  className="font-mono"
                />
              </Form.Item>
            </TabPane>
          </Tabs>
        </Card>

        <Card
          className="shadow-sm"
          title={
            <div className="flex items-center gap-2">
              <FileOutlined /> PDF Chunking Strategy
            </div>
          }
        >
          <Form.Item
            label="Pages Per Chunk"
            name="pages_per_chunk"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={50} size="large" className="w-full" />
          </Form.Item>
        </Card>

        <div>
          <Card
            className="shadow-sm"
            title={
              <div className="flex items-center gap-2">
                <ThunderboltOutlined /> LLM Generation Parameters
              </div>
            }
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Form.Item label="Temperature" name="temperature">
                <InputNumber min={0} max={2} step={0.1} className="w-full" />
              </Form.Item>
              <Form.Item label="Max Output Tokens" name="max_output_tokens">
                <InputNumber
                  min={512}
                  max={128000}
                  step={512}
                  className="w-full"
                />
              </Form.Item>
              <Form.Item label="Top P" name="top_p">
                <InputNumber min={0} max={1} step={0.05} className="w-full" />
              </Form.Item>
              <Form.Item
                label="Stop Sequences (comma separated)"
                name="stop_sequences"
              >
                <Input placeholder="e.g., ###, END_OF_RESPONSE" />
              </Form.Item>
            </div>
          </Card>
        </div>

        <div className="flex justify-end mt-5">
          <Space>
            <Button onClick={() => form.resetFields()} size="large">
              Reset
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<SaveOutlined />}
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
