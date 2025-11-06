import React, { useState } from "react";
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Space,
  Typography,
  Button,
} from "antd";
import {
  FileTextOutlined,
  SwapOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  FileSearchOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
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
      icon: <SwapOutlined />,
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
    <Layout className="h-screen overflow-hidden">
      {/* Header - Light with border */}
      <Header className="bg-white border-b border-gray-200 flex items-center justify-between px-6 fixed w-full z-10 h-16">
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
          <Space className="cursor-pointer hover:bg-gray-50 px-3 py-2 rounded-lg transition">
            <Avatar icon={<UserOutlined />} className="bg-blue-500" />
            <Text className="font-medium hidden sm:inline">
              {user?.username}
            </Text>
          </Space>
        </Dropdown>
      </Header>

      <Layout className="mt-16 h-[calc(100vh-64px)]">
        {/* Sidebar - White background matching content */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          className="bg-white border-r border-gray-200"
          width={240}
          theme="light"
        >
          {/* Collapse/Expand Button at Top */}
          <div className="flex justify-end p-4 border-b border-gray-200">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center"
            />
          </div>

          {/* Menu */}
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            className="h-full border-r-0"
          />
        </Sider>

        {/* Main Content - Scrollable, fit to viewport */}
        <Layout className="bg-gray-50">
          <Content className="overflow-y-auto h-full">
            <div className="p-6">{children}</div>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
