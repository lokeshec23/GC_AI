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
  Drawer,
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

  useEffect(() => {
    fetchSupportedModels();
    form.setFieldsValue({
      model_provider: "openai",
      model_name: "gpt-4o",
      custom_prompt: DEFAULT_PROMPT,
    });
  }, []);

  const fetchSupportedModels = async () => {
    try {
      const response = await settingsAPI.getSupportedModels();
      setSupportedModels(response.data);
    } catch {
      message.error("Failed to load supported models");
    }
  };

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    if (selectedFile.type !== "application/pdf")
      return message.error("Please select a PDF file");
    setFile(selectedFile);
    message.success(`${selectedFile.name} selected`);
  };

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const handleSubmit = async (values) => {
    if (!file) return message.error("Please upload a PDF file");
    if (!promptValue.trim()) return message.error("Prompt cannot be empty");

    try {
      setProcessing(true);
      setProgress(0);
      setProcessingModalVisible(true);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("model_provider", values.model_provider);
      formData.append("model_name", values.model_name);
      formData.append("custom_prompt", promptValue.trim());

      const response = await ingestAPI.ingestGuideline(formData);
      const { session_id } = response.data;
      setSessionId(session_id);

      const eventSource = ingestAPI.createProgressStream(session_id);

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.progress);
        setProgressMessage(data.message);

        if (data.progress >= 100) {
          eventSource.close();
          setProcessing(false);
          setProcessingModalVisible(false);
          fetchPreviewData(session_id);
        }
      };
    } catch (err) {
      setProcessing(false);
      setProcessingModalVisible(false);
      message.error(err.response?.data?.detail || "Processing failed");
    }
  };

  const fetchPreviewData = async (sid) => {
    try {
      const response = await ingestAPI.getPreview(sid);
      setPreviewData(response.data);
      setPreviewModalVisible(true);
    } catch {
      message.error("Failed to load preview");
    }
  };

  const convertToTableData = (data) =>
    Array.isArray(data)
      ? data.map((item, idx) => ({
          key: idx,
          major_section: item.major_section || "",
          subsection: item.subsection || "",
          summary: item.summary || "",
        }))
      : [];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <FileTextOutlined /> Ingest Guideline
        </h1>
      </div>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        {/* NEW Combined Prompt + Model Selection Card */}
        <Card
          title={
            <div className="flex items-center justify-between">
              <span className="text-base font-semibold">Extraction Prompt</span>
              <Tooltip title="Reset to default prompt">
                <Button
                  type="link"
                  icon={<ReloadOutlined />}
                  onClick={() => {
                    setPromptValue(DEFAULT_PROMPT);
                    form.setFieldsValue({ custom_prompt: DEFAULT_PROMPT });
                  }}
                  disabled={processing}
                  size="small"
                >
                  Reset
                </Button>
              </Tooltip>
            </div>
          }
        >
          <Form.Item name="custom_prompt" className="mb-4">
            <TextArea
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder="Enter your extraction prompt here..."
              className="font-mono text-sm resize-none"
              style={{
                minHeight: "420px", // Increased prompt height
                width: "100%",
              }}
              disabled={processing}
            />
          </Form.Item>

          {/* Bottom Controls Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 mt-2">
            {/* Provider + Model */}
            <Space>
              <Form.Item name="model_provider" noStyle>
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

              <Form.Item name="model_name" noStyle>
                <Select size="large" style={{ width: 200 }}>
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
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                onChange={handleFileSelect}
                hidden
              />

              {file ? (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded border border-blue-200">
                  <FileTextOutlined className="text-blue-600" />
                  <span className="text-sm text-blue-700 max-w-[180px] truncate">
                    {file.name}
                  </span>
                  <CloseCircleOutlined
                    className="text-blue-600 cursor-pointer"
                    onClick={handleRemoveFile}
                  />
                </div>
              ) : (
                <Button
                  icon={<PaperClipOutlined />}
                  onClick={handleAttachClick}
                  size="large"
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
                disabled={!file || processing}
              >
                Send
              </Button>
            </Space>
          </div>
        </Card>
      </Form>

      {/* Processing Modal */}
      <Modal
        open={processingModalVisible}
        footer={null}
        closable={false}
        centered
        width={600}
      >
        <Progress percent={progress} strokeWidth={12} />
        <p className="text-center mt-4 text-gray-600">{progressMessage}</p>
      </Modal>

      {/* Preview Drawer */}
      <Drawer
        title="Extraction Results"
        placement="right"
        width="100vw"
        open={previewModalVisible}
        closable={false}
        extra={
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => ingestAPI.downloadExcel(sessionId)}
            >
              Download Excel
            </Button>
            <Button
              icon={<CloseCircleOutlined />}
              onClick={() => setPreviewModalVisible(false)}
            >
              Close
            </Button>
          </Space>
        }
      >
        <Table
          dataSource={convertToTableData(previewData)}
          columns={[
            {
              title: "Major Section",
              dataIndex: "major_section",
              width: "30%",
            },
            { title: "Subsection", dataIndex: "subsection", width: "30%" },
            { title: "Summary", dataIndex: "summary", width: "40%" },
          ]}
          pagination={{ pageSize: 100 }}
          size="small"
          bordered
        />
      </Drawer>
    </div>
  );
};

export default IngestPage;
