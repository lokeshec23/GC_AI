import React, { useState } from "react";
import { Layout, Menu, Avatar, Dropdown, Space, Typography } from "antd";
import {
  FileTextOutlined,
  CompareOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  FileSearchOutlined,
} from "@ant-design/icons";
import { useAuth } from "../../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Menu items for sidebar
  const menuItems = [
    {
      key: "/ingest",
      icon: <FileTextOutlined />,
      label: "Ingest Guideline",
    },
    {
      key: "/compare",
      icon: <CompareOutlined />,
      label: "Compare Guidelines",
    },
    {
      key: "/settings",
      icon: <SettingOutlined />,
      label: "Settings",
    },
  ];

  // User dropdown menu
  const userMenuItems = [
    {
      key: "profile",
      icon: <UserOutlined />,
      label: (
        <div>
          <div className="font-semibold">{user?.username}</div>
          <div className="text-xs text-gray-500">{user?.email}</div>
        </div>
      ),
      disabled: true,
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
      label: "Logout",
      danger: true,
      onClick: () => {
        logout();
        navigate("/login");
      },
    },
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  return (
    <Layout className="min-h-screen">
      {/* Header */}
      <Header className="bg-white shadow-md flex items-center justify-between px-6 fixed w-full z-10">
        <div className="flex items-center gap-3">
          <FileSearchOutlined className="text-3xl text-blue-600" />
          <Text className="text-xl font-bold text-gray-800">
            Guideline Extraction System
          </Text>
        </div>

        <Dropdown
          menu={{ items: userMenuItems }}
          placement="bottomRight"
          trigger={["click"]}
        >
          <Space className="cursor-pointer hover:bg-gray-100 px-3 py-2 rounded-lg transition">
            <Avatar icon={<UserOutlined />} className="bg-blue-500" />
            <Text className="font-medium hidden sm:inline">
              {user?.username}
            </Text>
          </Space>
        </Dropdown>
      </Header>

      <Layout className="mt-16">
        {/* Sidebar */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          className="bg-white shadow-lg"
          width={240}
          theme="light"
        >
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            className="h-full border-r-0 pt-4"
          />
        </Sider>

        {/* Main Content */}
        <Layout className="bg-gray-50">
          <Content className="m-6 p-6 bg-white rounded-lg shadow-sm min-h-[calc(100vh-120px)]">
            {children}
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
