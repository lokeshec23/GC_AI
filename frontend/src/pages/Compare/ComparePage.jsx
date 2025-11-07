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
  FileExcelOutlined,
  SendOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  LoadingOutlined,
  ReloadOutlined,
  PaperClipOutlined,
  EyeOutlined,
} from "@ant-design/icons";
import { compareAPI, settingsAPI } from "../../services/api";

const { TextArea } = Input;
const { Option } = Select;

// ✅ Default comparison prompt
const DEFAULT_COMPARISON_PROMPT = `You are an expert mortgage guideline analyst tasked with comparing two guidelines.

INSTRUCTIONS:
1. Compare the two guidelines provided (Guideline 1 is original, Guideline 2 is updated).
2. Identify what was Added, Removed, Modified, or remains Unchanged.
3. Focus on substantive differences in rules, requirements, and eligibility criteria.
4. Organize the comparison logically by section or category.

OUTPUT FORMAT (JSON ONLY):
Return a JSON array where each object represents a comparison item:

[
  {
    "category": "Added",
    "section": "The section where the rule was added",
    "guideline1_value": "Not present",
    "guideline2_value": "The new rule or requirement in Guideline 2",
    "difference": "A brief explanation of what was added."
  },
  {
    "category": "Modified",
    "section": "The section that changed",
    "guideline1_value": "The original requirement from Guideline 1",
    "guideline2_value": "The updated requirement from Guideline 2",
    "difference": "A summary of what specifically changed between the two versions."
  },
  {
    "category": "Removed",
    "section": "The section from which the rule was removed",
    "guideline1_value": "The rule that was present in Guideline 1",
    "guideline2_value": "Not present",
    "difference": "This rule was removed in the updated guideline."
  }
]

CATEGORIES TO USE:
- "Added"
- "Removed"
- "Modified"
- "Unchanged"

CRITICAL:
- Output ONLY a valid JSON array.
- No markdown, no code blocks, no explanations.
- Start with [ and end with ].`;

const ComparePage = () => {
  const [form] = Form.useForm();
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
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

  // State for prompt
  const [promptValue, setPromptValue] = useState(DEFAULT_COMPARISON_PROMPT);

  // Modal states
  const [processingModalVisible, setProcessingModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);

  const file1InputRef = useRef(null);
  const file2InputRef = useRef(null);

  useEffect(() => {
    fetchSupportedModels();

    // Set initial form values
    form.setFieldsValue({
      model_provider: "openai",
      model_name: "gpt-4o",
      custom_prompt: DEFAULT_COMPARISON_PROMPT,
    });

    setPromptValue(DEFAULT_COMPARISON_PROMPT);
  }, []);

  const fetchSupportedModels = async () => {
    try {
      const response = await settingsAPI.getSupportedModels();
      setSupportedModels(response.data);
    } catch (error) {
      message.error("Failed to load supported models");
    }
  };

  // File handlers
  const handleFile1Select = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      if (
        !selectedFile.name.toLowerCase().endsWith(".xlsx") &&
        !selectedFile.name.toLowerCase().endsWith(".xls")
      ) {
        message.error("Please select an Excel file (.xlsx or .xls)");
        return;
      }
      setFile1(selectedFile);
      message.success(`Guideline 1: ${selectedFile.name} selected`);
    }
  };

  const handleFile2Select = (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
      if (
        !selectedFile.name.toLowerCase().endsWith(".xlsx") &&
        !selectedFile.name.toLowerCase().endsWith(".xls")
      ) {
        message.error("Please select an Excel file (.xlsx or .xls)");
        return;
      }
      setFile2(selectedFile);
      message.success(`Guideline 2: ${selectedFile.name} selected`);
    }
  };

  const handleRemoveFile1 = () => {
    setFile1(null);
    if (file1InputRef.current) file1InputRef.current.value = "";
    message.info("Guideline 1 removed");
  };

  const handleRemoveFile2 = () => {
    setFile2(null);
    if (file2InputRef.current) file2InputRef.current.value = "";
    message.info("Guideline 2 removed");
  };

  const handleAttachFile1Click = () => file1InputRef.current?.click();
  const handleAttachFile2Click = () => file2InputRef.current?.click();

  // Prompt handlers
  const handleResetPrompt = () => {
    setPromptValue(DEFAULT_COMPARISON_PROMPT);
    form.setFieldsValue({ custom_prompt: DEFAULT_COMPARISON_PROMPT });
    message.success("Prompt reset to default");
  };

  const handlePromptChange = (e) => setPromptValue(e.target.value);

  const handleSubmit = async (values) => {
    if (!file1 || !file2) {
      message.error("Please upload both Excel files for comparison");
      return;
    }

    const currentPrompt = promptValue.trim();
    if (!currentPrompt) {
      message.error("Please enter a comparison prompt");
      return;
    }

    try {
      setProcessing(true);
      setProgress(0);
      setProgressMessage("Initializing...");
      setPreviewData(null);
      setProcessingModalVisible(true);

      const formData = new FormData();
      formData.append("file1", file1);
      formData.append("file2", file2);
      formData.append("model_provider", values.model_provider);
      formData.append("model_name", values.model_name);
      formData.append("custom_prompt", currentPrompt);

      const response = await compareAPI.compareGuidelines(formData);
      const { session_id } = response.data;
      setSessionId(session_id);

      message.success("Comparison started!");

      const eventSource = compareAPI.createProgressStream(session_id);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress);
        setProgressMessage(data.message);

        if (data.progress >= 100) {
          eventSource.close();
          setProcessing(false);
          setProcessingModalVisible(false);
          fetchPreviewData(session_id);
          message.success("Comparison complete!");
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
      message.error(error.response?.data?.detail || "Comparison failed");
    }
  };

  const fetchPreviewData = async (sid) => {
    try {
      const response = await compareAPI.getPreview(sid);
      setPreviewData(response.data);
      setPreviewModalVisible(true);
    } catch (error) {
      console.error("Failed to fetch preview:", error);
      message.error("Failed to load preview data");
    }
  };

  const handleDownload = () => {
    if (sessionId) {
      message.success("Downloading comparison Excel file...");
      compareAPI.downloadExcel(sessionId);
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
      category: item.category || "",
      section: item.section || "",
      guideline1_value: item.guideline1_value || "",
      guideline2_value: item.guideline2_value || "",
      difference: item.difference || "",
    }));
  };

  const tableColumns = [
    {
      title: "Category",
      dataIndex: "category",
      key: "category",
      width: 150,
      render: (text) => {
        let color = "default";
        if (text.toLowerCase().includes("add")) color = "green";
        else if (text.toLowerCase().includes("remove")) color = "red";
        else if (text.toLowerCase().includes("modif")) color = "orange";
        else if (text.toLowerCase().includes("unchanged")) color = "blue";
        return <Tag color={color}>{text}</Tag>;
      },
      filters: [
        { text: "Added", value: "Added" },
        { text: "Removed", value: "Removed" },
        { text: "Modified", value: "Modified" },
        { text: "Unchanged", value: "Unchanged" },
      ],
      onFilter: (value, record) => record.category.includes(value),
    },
    {
      title: "Section",
      dataIndex: "section",
      key: "section",
      width: 200,
      render: (text) => <span className="font-semibold">{text}</span>,
    },
    {
      title: file1?.name || "Guideline 1",
      dataIndex: "guideline1_value",
      key: "guideline1_value",
      width: 300,
      render: (text) => (
        <div className="whitespace-pre-wrap text-sm">
          {text || <span className="text-gray-400 italic">Not present</span>}
        </div>
      ),
    },
    {
      title: file2?.name || "Guideline 2",
      dataIndex: "guideline2_value",
      key: "guideline2_value",
      width: 300,
      render: (text) => (
        <div className="whitespace-pre-wrap text-sm">
          {text || <span className="text-gray-400 italic">Not present</span>}
        </div>
      ),
    },
    {
      title: "Difference",
      dataIndex: "difference",
      key: "difference",
      width: 250,
      render: (text) => (
        <div className="whitespace-pre-wrap text-sm font-semibold">{text}</div>
      ),
    },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <SwapOutlined />
          Compare Guidelines
        </h1>
        <p className="text-gray-600 mt-2">
          Upload two Excel files to compare guidelines and identify differences
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

        {/* File Upload Section */}
        <Card
          className="mb-6"
          title={
            <>
              <FileExcelOutlined /> Upload Excel Files to Compare
            </>
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* File 1 */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-400 transition">
              <input
                ref={file1InputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile1Select}
                style={{ display: "none" }}
                disabled={processing}
              />
              <div className="text-center">
                <div className="mb-4">
                  <FileExcelOutlined className="text-5xl text-blue-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  Guideline 1 (Original)
                </h3>
                {!file1 ? (
                  <Button
                    icon={<PaperClipOutlined />}
                    size="large"
                    onClick={handleAttachFile1Click}
                    disabled={processing}
                    block
                  >
                    Choose First Excel File
                  </Button>
                ) : (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <FileExcelOutlined className="text-blue-600 text-xl" />
                        <div className="text-left flex-1">
                          <p className="font-medium text-blue-800 truncate">
                            {file1.name}
                          </p>
                          <p className="text-xs text-blue-600">
                            {(file1.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        type="text"
                        danger
                        icon={<CloseCircleOutlined />}
                        onClick={handleRemoveFile1}
                        disabled={processing}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* File 2 */}
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-green-400 transition">
              <input
                ref={file2InputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFile2Select}
                style={{ display: "none" }}
                disabled={processing}
              />
              <div className="text-center">
                <div className="mb-4">
                  <FileExcelOutlined className="text-5xl text-green-500" />
                </div>
                <h3 className="text-lg font-semibold mb-2">
                  Guideline 2 (Updated)
                </h3>
                {!file2 ? (
                  <Button
                    icon={<PaperClipOutlined />}
                    size="large"
                    onClick={handleAttachFile2Click}
                    disabled={processing}
                    block
                  >
                    Choose Second Excel File
                  </Button>
                ) : (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1">
                        <FileExcelOutlined className="text-green-600 text-xl" />
                        <div className="text-left flex-1">
                          <p className="font-medium text-green-800 truncate">
                            {file2.name}
                          </p>
                          <p className="text-xs text-green-600">
                            {(file2.size / 1024).toFixed(2)} KB
                          </p>
                        </div>
                      </div>
                      <Button
                        type="text"
                        danger
                        icon={<CloseCircleOutlined />}
                        onClick={handleRemoveFile2}
                        disabled={processing}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>

        {/* Comparison Prompt */}
        <Card
          className="mb-6"
          title={
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Comparison Prompt</span>
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
            <TextArea
              value={promptValue}
              onChange={handlePromptChange}
              placeholder="Enter your comparison prompt here..."
              className="font-mono text-sm"
              rows={10}
              disabled={processing}
            />
          </Form.Item>
        </Card>

        {/* Submit Button */}
        <div className="flex justify-end mb-6">
          <Button
            type="primary"
            htmlType="submit"
            icon={<SendOutlined />}
            size="large"
            loading={processing}
            disabled={processing || !file1 || !file2}
          >
            {processing ? "Comparing..." : "Compare Guidelines"}
          </Button>
        </div>
      </Form>

      {/* Processing Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2">
            <Spin
              indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />}
            />
            <span className="text-lg font-semibold">Comparing Guidelines</span>
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
            strokeColor={{ "0%": "#108ee9", "100%": "#87d068" }}
            strokeWidth={12}
          />
          <div className="mt-6 text-center">
            <p className="text-gray-600 text-base">{progressMessage}</p>
          </div>
          {file1 && file2 && (
            <div className="mt-4 space-y-2">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-blue-800">
                  <FileExcelOutlined />
                  <span>
                    Guideline 1: <strong>{file1.name}</strong>
                  </span>
                </div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-green-800">
                  <FileExcelOutlined />
                  <span>
                    Guideline 2: <strong>{file2.name}</strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Preview Modal */}
      <Modal
        title={
          <div className="flex items-center gap-2 text-lg">
            <SwapOutlined className="text-purple-600" />
            <span className="font-semibold">Comparison Results</span>
          </div>
        }
        open={previewModalVisible}
        onCancel={handleClosePreview}
        width="95vw"
        style={{ top: 20, maxWidth: "1800px" }}
        centered={false}
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
            Download Comparison Excel
          </Button>,
        ]}
        bodyStyle={{
          padding: "24px",
          maxHeight: "calc(100vh - 200px)",
          overflowY: "auto",
        }}
      >
        {previewData ? (
          <div>
            <div className="mb-4 flex gap-2 flex-wrap">
              <Tag color="green">Added</Tag>
              <Tag color="red">Removed</Tag>
              <Tag color="orange">Modified</Tag>
              <Tag color="blue">Unchanged</Tag>
            </div>
            <div style={{ height: "calc(100vh - 350px)", minHeight: "400px" }}>
              <Table
                columns={tableColumns}
                dataSource={convertToTableData(previewData)}
                pagination={{
                  pageSize: 50,
                  showSizeChanger: true,
                  showQuickJumper: true,
                  pageSizeOptions: ["20", "50", "100"],
                  showTotal: (total, range) =>
                    `${range[0]}-${range[1]} of ${total} items`,
                  position: ["bottomCenter"],
                }}
                scroll={{ x: "max-content", y: "calc(100vh - 450px)" }}
                size="small"
                bordered
                sticky
              />
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Spin size="large" />
            <p className="mt-4 text-gray-500">Loading comparison results...</p>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ComparePage;
