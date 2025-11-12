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
} from "antd";
import {
  FileExcelOutlined,
  SendOutlined,
  DownloadOutlined,
  CloseCircleOutlined,
  SwapOutlined,
  LoadingOutlined,
  PaperClipOutlined,
} from "@ant-design/icons";
import { compareAPI, settingsAPI } from "../../services/api";

const { TextArea } = Input;
const { Option } = Select;

// Default comparison prompt
// const DEFAULT_COMPARISON_PROMPT = `You are a senior mortgage underwriting analyst. Your task is to perform a detailed, side-by-side comparison of two mortgage guideline documents: "Guideline 1" and "Guideline 2".

// ### PRIMARY GOAL
// Analyze the two provided sets of guideline data, identify all similarities and differences for each rule, and structure the output as a clean, valid JSON array suitable for a comparison table.

// ### OUTPUT SCHEMA (JSON ONLY)
// You MUST return a valid JSON array. Each object in the array represents a single comparison row and MUST contain these five keys:
// 1.  "rule_id": A sequential number for the rule being compared (e.g., 1, 2, 3...).
// 2.  "category": The broad topic the rule falls under (e.g., "Borrower Eligibility", "Credit", "Loan Parameters").
// 3.  "attribute": The specific rule or policy being defined (e.g., "Minimum Credit Score", "Housing Event Seasoning").
// 4.  "guideline_1": The exact rule or summary from the first guideline document. If not present, state "Not Addressed".
// 5.  "guideline_2": The exact rule or summary from the second guideline document. If not present, state "Not Addressed".
// 6.  "comparison_notes": A concise, expert analysis of the difference or similarity. Start with the key difference and then provide context.

// ### EXTRACTION & ANALYSIS INSTRUCTIONS
// 1.  **Align Rules:** Match corresponding rules from both guidelines based on their "attribute" or topic. If a rule exists in one but not the other, still create a row for it.
// 2.  **Extract Verbatim:** For the "guideline_1" and "guideline_2" fields, extract the rule's text as accurately as possible.
// 3.  **Analyze and Compare:** For the "comparison_notes" field, provide a meaningful analysis. Do not just state that they are different. Explain *how* they are different. For example: "TLS has a more lenient credit score requirement (660) compared to NQM's (720)." or "Both lenders have nearly identical policies on this rule."
// 4.  **Be Comprehensive:** Create a row for every single attribute found in either document to ensure a complete comparison.

// ### EXAMPLE OF PERFECT OUTPUT
// This is the exact format you must follow.

// [
//   {
//     "rule_id": 1,
//     "category": "Borrower Eligibility",
//     "attribute": "Minimum Credit Score (DSCR)",
//     "guideline_1": "660 for standard DSCR. program. 720 for DSCR Supreme.",
//     "guideline_2": "660 for standard DSCR. No US FICO required for Foreign Nationals.",
//     "comparison_notes": "Both lenders have a similar minimum score for standard DSCR, but Guideline 1 has a higher requirement for its 'Supreme' program."
//   },
//   {
//     "rule_id": 2,
//     "category": "DSCR",
//     "attribute": "Minimum DSCR Ratio",
//     "guideline_1": "0.75 for Investor DSCR. 1.00 for DSCR Supreme.",
//     "guideline_2": "Generally > 1.00. Ratios from 0.75 - 0.99 require a formal exception.",
//     "comparison_notes": "Guideline 1 has a dedicated program for DSCR < 1.00, while Guideline 2 treats it as an exception requiring formal review."
//   },
//   {
//     "rule_id": 3,
//     "category": "Property Eligibility",
//     "attribute": "Rural Properties (DSCR)",
//     "guideline_1": "Not Permitted. Guideline refers to CFPB rural/underserved tool for definition.",
//     "guideline_2": "Ineligible.",
//     "comparison_notes": "Identical policy; both lenders consider rural properties ineligible for this program."
//   }
// ]

// ### FINAL COMMANDS
// - Your entire response MUST be a single, valid JSON array.
// - Start with '[' and end with ']'.
// - DO NOT include any text, explanations, or markdown outside of the JSON.
// - Every object MUST have all six specified keys.`;

// Replace DEFAULT_COMPARISON_PROMPT in ComparePage.jsx

// Replace DEFAULT_COMPARISON_PROMPT in ComparePage.jsx

const DEFAULT_COMPARISON_PROMPT = `You are a senior mortgage underwriting analyst. Your task is to perform a detailed, side-by-side comparison of guideline rules provided as pairs of JSON objects.

### PRIMARY GOAL
For each pair of objects in the "DATA CHUNK TO COMPARE" array, you must generate a single, consolidated JSON object that accurately represents the comparison, matching the desired output schema.

### INPUT DATA STRUCTURE
You will receive a JSON array. Each object in the array contains two keys: "guideline_1_data" and "guideline_2_data".
- "guideline_1_data" will be a JSON object representing a row from the first Excel file, or the string "Not present".
- "guideline_2_data" will be a JSON object representing a row from the second Excel file, or the string "Not present".
- The original Excel column names are the keys within these objects.

### OUTPUT SCHEMA (JSON ONLY)
You MUST return a valid JSON array. Each object in the array MUST contain these six keys:
1.  "rule_id": The 'Rule Id' from the source data. If not present in either, generate a sequential number.
2.  "category": The 'Category' from the source data.
3.  "attribute": The 'Attribute' from the source data.
4.  "guideline_1": The text of the rule from the first guideline. Find this value within the 'guideline_1_data' object (the key might be the filename, e.g., 'NQM Funding Guideline'). If 'guideline_1_data' is "Not present", this value MUST be "Not present".
5.  "guideline_2": The text of the rule from the second guideline. Find this value within the 'guideline_2_data' object (the key might be the filename, e.g., 'TLS Guideline'). If 'guideline_2_data' is "Not present", this value MUST be "Not present".
6.  "comparison_notes": Your expert analysis of the difference or similarity. This is the most important field. Be concise, insightful, and clear.

### DETAILED ANALYSIS INSTRUCTIONS
1.  **Iterate:** Process each object in the input array. For each object, you will produce one object in the output array.
2.  **Identify Key Information:** From the 'guideline_1_data' and 'guideline_2_data' objects, extract the values for 'Rule Id', 'Category', and 'Attribute'.
3.  **Extract Guideline Text:** The main rule text in the source objects will be under a key that is the original filename (e.g., 'NQM Funding Guideline' or 'TLS Guideline'). You must correctly identify and extract this text.
4.  **Analyze and Summarize:** Compare the extracted guideline texts. In "comparison_notes", do not just state they are different. Explain *how*. For example: "TLS has a more lenient credit score, but NQM has a more restrictive LTV for loans over $1.5M."
5.  **Handle Missing Data:** If 'guideline_1_data' is "Not present", the 'comparison_notes' should state this is a new rule in Guideline 2. If 'guideline_2_data' is "Not present", state it was removed.

### EXAMPLE OF PERFECT OUTPUT
If you are given an input pair like this:
{
  "guideline_1_data": { "Rule Id": 1, "Category": "Borrower Eligibility", "Attribute": "Minimum Credit Score (DSCR)", "NQM Funding Guideline": "660 for standard DSCR program. 720 for DSCR Supreme." },
  "guideline_2_data": { "Rule Id": 1, "Category": "Borrower Eligibility", "Attribute": "Minimum Credit Score (DSCR)", "TLS Guideline": "660 for standard DSCR. No US FICO required for Foreign Nationals." }
}

Your corresponding output object MUST be:
{
  "rule_id": 1,
  "category": "Borrower Eligibility",
  "attribute": "Minimum Credit Score (DSCR)",
  "guideline_1": "660 for standard DSCR program. 720 for DSCR Supreme.",
  "guideline_2": "660 for standard DSCR. No US FICO required for Foreign Nationals.",
  "comparison_notes": "Both lenders have a similar minimum score (660) for standard DSCR, but NQM has a higher requirement for its Supreme program. TLS provides an explicit allowance for Foreign Nationals without a US FICO."
}

### FINAL COMMANDS
- Your entire response MUST be a single, valid JSON array.
- The number of objects in your output must match the number of pairs in the input.
- DO NOT add any text or markdown outside of the JSON array. Start with '[' and end with ']'.`;

const ComparePage = () => {
  const [form] = Form.useForm();

  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");

  const [supportedModels, setSupportedModels] = useState({
    openai: [],
    gemini: [],
  });
  const [selectedProvider, setSelectedProvider] = useState("openai");
  const [promptValue, setPromptValue] = useState(DEFAULT_COMPARISON_PROMPT);

  const [previewData, setPreviewData] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [tableColumns, setTableColumns] = useState([]);

  const [processingModalVisible, setProcessingModalVisible] = useState(false);
  const [previewModalVisible, setPreviewModalVisible] = useState(false);

  const file1InputRef = useRef(null);
  const file2InputRef = useRef(null);

  useEffect(() => {
    fetchModels();
    form.setFieldsValue({
      model_provider: "openai",
      model_name: "gpt-4o", // Keep OpenAI default
      custom_prompt: DEFAULT_COMPARISON_PROMPT,
    });
    setPromptValue(DEFAULT_COMPARISON_PROMPT);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchModels = async () => {
    try {
      const res = await settingsAPI.getSupportedModels();
      setSupportedModels(res.data);
    } catch {
      message.error("Failed to load models");
    }
  };

  const handlePromptChange = (e) => setPromptValue(e.target.value);

  const selectFile1 = () => file1InputRef.current.click();
  const selectFile2 = () => file2InputRef.current.click();

  const handleFile1Select = (e) => setFile1(e.target.files[0]);
  const handleFile2Select = (e) => setFile2(e.target.files[0]);

  const handleSubmit = async (values) => {
    if (!file1 || !file2)
      return message.error("Please attach both files for comparison.");
    const currentPrompt = promptValue.trim();
    if (!currentPrompt)
      return message.error("Please enter a comparison prompt.");

    setProcessing(true);
    setProgress(0);
    setProgressMessage("Initializing comparison...");
    setProcessingModalVisible(true);

    const fd = new FormData();
    fd.append("file1", file1);
    fd.append("file2", file2);
    fd.append("model_provider", values.model_provider);
    fd.append("model_name", values.model_name);
    fd.append("custom_prompt", currentPrompt);

    try {
      const res = await compareAPI.compareGuidelines(fd);
      const { session_id } = res.data;
      setSessionId(session_id);

      const sse = compareAPI.createProgressStream(session_id);
      sse.onmessage = (e) => {
        const data = JSON.parse(e.data);
        setProgress(data.progress);
        setProgressMessage(data.message);
        if (data.progress >= 100) {
          sse.close();
          setProcessing(false);
          setProcessingModalVisible(false);
          loadPreview(session_id);
          message.success("Comparison complete!");
        }
      };
      sse.onerror = () => {
        sse.close();
        setProcessing(false);
        setProcessingModalVisible(false);
        message.error("An error occurred during comparison.");
      };
    } catch (error) {
      setProcessing(false);
      setProcessingModalVisible(false);
      message.error(
        error.response?.data?.detail || "Comparison failed to start."
      );
    }
  };

  const loadPreview = async (sid) => {
    try {
      const res = await compareAPI.getPreview(sid);
      const data = res.data;

      if (data && data.length > 0) {
        // Dynamically create columns
        const columns = Object.keys(data[0]).map((key) => ({
          title: key
            .replace(/_/g, " ")
            .replace(/\b\w/g, (l) => l.toUpperCase()),
          dataIndex: key,
          key: key,
          width: 250,
          render: (text) => (
            <div className="whitespace-pre-wrap">{String(text)}</div>
          ),
        }));
        setTableColumns(columns);
        setPreviewData(data);
      } else {
        setTableColumns([{ title: "Result", dataIndex: "content" }]);
        setPreviewData([
          {
            key: "1",
            content:
              "No differences were found or data could not be structured.",
          },
        ]);
      }
      setPreviewModalVisible(true);
    } catch {
      message.error("Failed to load comparison results.");
    }
  };

  const handleDownload = () => {
    if (sessionId) {
      message.loading("Preparing download...", 1);
      compareAPI.downloadExcel(sessionId);
    }
  };

  const closePreview = () => {
    setPreviewModalVisible(false);
    setPreviewData(null);
    setTableColumns([]);
    setSessionId(null);
  };

  const convertRows = (data) => (data || []).map((r, i) => ({ key: i, ...r }));

  return (
    <div className="max-w-6xl mx-auto pb-10">
      <h1 className="text-3xl font-bold font-poppins flex items-center gap-2 mb-2">
        <SwapOutlined /> Compare Guidelines
      </h1>
      <p className="text-gray-500 mb-6">
        Upload two Excel files to identify the differences using an AI model.
      </p>

      <Form form={form} layout="vertical" onFinish={handleSubmit}>
        <Card title="Comparison Prompt" className="mb-6">
          <Form.Item name="custom_prompt">
            <TextArea
              value={promptValue}
              onChange={handlePromptChange}
              style={{ minHeight: "420px" }}
              className="font-mono text-sm"
              placeholder="Define the logic for comparing the two files..."
              disabled={processing}
            />
          </Form.Item>

          <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
            <Space wrap>
              <Form.Item name="model_provider" noStyle>
                <Select
                  size="large"
                  style={{ width: 170 }}
                  onChange={(v) => {
                    setSelectedProvider(v);
                    // ✅ When user selects Gemini, default to the best model from the new list
                    const defaultModel =
                      v === "gemini"
                        ? "gemini-2.5-pro"
                        : supportedModels[v]?.[0];
                    form.setFieldsValue({
                      model_name: defaultModel,
                    });
                  }}
                  disabled={processing}
                >
                  <Option value="openai">OpenAI</Option>
                  <Option value="gemini">Google Gemini</Option>
                </Select>
              </Form.Item>

              <Form.Item name="model_name" noStyle>
                <Select
                  size="large"
                  style={{ width: 200 }}
                  disabled={processing}
                >
                  {supportedModels[selectedProvider]?.map((m) => (
                    <Option key={m} value={m}>
                      {m}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Space>

            <Space wrap>
              <input
                ref={file1InputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={handleFile1Select}
                disabled={processing}
              />
              <Button
                icon={<PaperClipOutlined />}
                size="large"
                onClick={selectFile1}
                disabled={processing}
              >
                {file1 ? file1.name : "Attach Guideline 1"}
              </Button>

              <input
                ref={file2InputRef}
                type="file"
                accept=".xlsx,.xls"
                hidden
                onChange={handleFile2Select}
                disabled={processing}
              />
              <Button
                icon={<PaperClipOutlined />}
                size="large"
                onClick={selectFile2}
                disabled={processing}
              >
                {file2 ? file2.name : "Attach Guideline 2"}
              </Button>

              <Button
                type="primary"
                htmlType="submit"
                size="large"
                icon={<SendOutlined />}
                disabled={!file1 || !file2 || processing}
                loading={processing}
              >
                Compare
              </Button>
            </Space>
          </div>
        </Card>
      </Form>

      <Modal
        open={processingModalVisible}
        footer={null}
        closable={false}
        centered
        width={600}
      >
        <div className="py-4">
          <h2 className="text-lg font-semibold text-center mb-4">
            Comparing Guidelines...
          </h2>
          <Progress
            percent={progress}
            strokeWidth={12}
            status={progress === 100 ? "success" : "active"}
          />
          <p className="text-center mt-4 text-gray-600">{progressMessage}</p>
        </div>
      </Modal>

      <Modal
        open={previewModalVisible}
        closable={false}
        centered
        footer={null}
        maskClosable={false}
        width="90vw"
        style={{ top: "5vh" }}
      >
        <div className="flex justify-between items-center mb-4 border-b pb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <SwapOutlined className="text-purple-600" /> Comparison Results
          </h2>
          <Space>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownload}
            >
              Download Excel
            </Button>
            <Button icon={<CloseCircleOutlined />} onClick={closePreview}>
              Close
            </Button>
          </Space>
        </div>

        <div style={{ height: "calc(90vh - 120px)", overflowY: "auto" }}>
          <Table
            dataSource={convertRows(previewData)}
            columns={tableColumns}
            pagination={{ pageSize: 50, showSizeChanger: true }}
            bordered
            size="small"
            scroll={{ x: "max-content" }}
          />
        </div>
      </Modal>
    </div>
  );
};

export default ComparePage;
