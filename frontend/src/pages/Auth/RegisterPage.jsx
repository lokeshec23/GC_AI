// src/pages/Auth/RegisterPage.jsx

import React, { useState } from "react";
import { Form, Input, Button, Card, Typography, message } from "antd";
import {
  UserOutlined,
  LockOutlined,
  MailOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, Link } from "react-router-dom";

const { Title, Text } = Typography;

// Reusable Logo component
const Logo = () => (
  <div className="text-center mb-6">
    <img src="/loandna_logo.png" alt="LoanDNA Logo" className="h-10 mx-auto" />
  </div>
);

const RegisterPage = () => {
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const onFinish = async (values) => {
    setLoading(true);
    const success = await register(
      values.username,
      values.email,
      values.password
    );
    setLoading(false);

    if (success) {
      message.success("Registration successful! Please log in.");
      navigate("/login");
    }
  };

  return (
    <div className="auth-background">
      <Card className="w-full max-w-sm shadow-2xl rounded-xl p-4">
        <Logo />
        <div className="text-center mb-6">
          <Title level={3} className="!font-poppins text-gray-700">
            Create an Account
          </Title>
        </div>

        <Form
          name="register"
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
        >
          <Form.Item
            label="Username"
            name="username"
            rules={[{ required: true, message: "Please choose a username!" }]}
          >
            <Input
              prefix={
                <UserOutlined className="site-form-item-icon text-gray-400" />
              }
              placeholder="Choose a username"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Email Address"
            name="email"
            rules={[
              { required: true, message: "Please enter your email address!" },
              { type: "email", message: "Please enter a valid email address!" },
            ]}
          >
            <Input
              prefix={
                <MailOutlined className="site-form-item-icon text-gray-400" />
              }
              placeholder="Enter your email"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[
              { required: true, message: "Please create a password!" },
              {
                min: 8,
                message: "Password must be at least 8 characters long.",
              },
            ]}
            hasFeedback
          >
            <Input.Password
              prefix={
                <LockOutlined className="site-form-item-icon text-gray-400" />
              }
              placeholder="Create a password"
              size="large"
            />
          </Form.Item>

          <Form.Item
            label="Confirm Password"
            name="confirm"
            dependencies={["password"]}
            hasFeedback
            rules={[
              { required: true, message: "Please confirm your password!" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("password") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(
                    new Error("The two passwords do not match!")
                  );
                },
              }),
            ]}
          >
            <Input.Password
              prefix={
                <LockOutlined className="site-form-item-icon text-gray-400" />
              }
              placeholder="Confirm your password"
              size="large"
            />
          </Form.Item>

          <Form.Item className="mt-6">
            <Button
              type="primary"
              htmlType="submit"
              icon={<UserAddOutlined />}
              loading={loading}
              size="large"
              block
              className="font-semibold"
            >
              Register
            </Button>
          </Form.Item>

          <div className="text-center mt-4">
            <Text type="secondary">
              Already have an account?{" "}
              <Link
                to="/login"
                className="font-semibold text-blue-600 hover:underline"
              >
                Log in here
              </Link>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  );
};

export default RegisterPage;
