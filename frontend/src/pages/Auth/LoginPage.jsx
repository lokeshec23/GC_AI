// src/pages/Auth/LoginPage.jsx

import React, { useState } from "react";
import { Form, Input, Button, Card, Typography, Checkbox } from "antd";
import { UserOutlined, LockOutlined, LoginOutlined } from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

const { Title, Text } = Typography;

// Logo component now uses the image from the public folder
const Logo = () => (
  <div className="text-center mb-6">
    {/* Assumes your logo is named 'loandna-logo.png' in the public folder */}
    <img
      src="/loandna_logo.png"
      alt="LoanDNA Logo"
      className="h-10 mx-auto" // Adjust height (h-10) as needed
    />
  </div>
);

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (values) => {
    setLoading(true);
    const success = await login(values.username, values.password); // Using a generic username field
    setLoading(false);

    if (success) {
      navigate("/ingest");
    }
  };

  return (
    <div className="auth-background">
      <Card className="w-full max-w-sm shadow-2xl rounded-xl p-4">
        <Logo />
        <div className="text-center mb-6">
          <Title level={3} className="!font-poppins text-gray-700">
            Log In
          </Title>
        </div>

        <Form
          name="login"
          layout="vertical"
          onFinish={handleSubmit}
          autoComplete="off"
        >
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: "Please enter your username!" }]}
          >
            <Input
              prefix={
                <UserOutlined className="site-form-item-icon text-gray-400" />
              }
              placeholder="Enter your username"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Please enter your password!" }]}
          >
            <Input.Password
              prefix={
                <LockOutlined className="site-form-item-icon text-gray-400" />
              }
              placeholder="Enter your password"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <div className="flex justify-between items-center">
              <Checkbox>Remember me</Checkbox>
              <a className="text-blue-600 hover:text-blue-700 text-sm" href="#">
                Forgot password?
              </a>
            </div>
          </Form.Item>

          {/* CAPTCHA section is now removed */}

          <Form.Item className="mt-6">
            <Button
              type="primary"
              htmlType="submit"
              icon={<LoginOutlined />}
              loading={loading}
              size="large"
              block
              className="font-semibold"
            >
              Login
            </Button>
          </Form.Item>

          <div className="text-center mt-4">
            <Text type="secondary">
              Don't have an account?{" "}
              <Link
                to="/register"
                className="font-semibold text-blue-600 hover:underline"
              >
                Register now
              </Link>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default LoginPage;
