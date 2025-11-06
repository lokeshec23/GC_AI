import React from "react";
import { Card, Empty, Button } from "antd";
import { CompareOutlined, ToolOutlined } from "@ant-design/icons";

const ComparePage = () => {
  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
          <CompareOutlined />
          Compare Guidelines
        </h1>
        <p className="text-gray-600 mt-2">
          Compare two extracted guidelines side-by-side
        </p>
      </div>

      <Card>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <div>
              <p className="text-lg font-semibold mb-2">Coming Soon!</p>
              <p className="text-gray-600 mb-4">
                This feature is under development. You'll be able to upload two
                Excel files and compare guidelines with custom prompts.
              </p>
              <Button type="primary" icon={<ToolOutlined />} disabled>
                Start Comparison
              </Button>
            </div>
          }
        />
      </Card>
    </div>
  );
};

export default ComparePage;
