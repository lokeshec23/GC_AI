import React, { useState } from "react";
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Space,
  Typography,
  Button,
  Input, // Import Input for the search bar
  Badge, // Import Badge for the notification icon
} from "antd";
import {
  FileTextOutlined,
  SwapOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  SearchOutlined, // For the search bar
  BellOutlined, // For the notification icon
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

  // Menu items for the sidebar (unchanged)
  const menuItems = [
    { key: "/ingest", icon: <FileTextOutlined />, label: "Ingest Guideline" },
    { key: "/compare", icon: <SwapOutlined />, label: "Compare Guidelines" },
    { key: "/settings", icon: <SettingOutlined />, label: "Settings" },
  ];

  // User dropdown menu (unchanged)
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
    { type: "divider" },
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
    <Layout className="h-screen overflow-hidden font-sans">
      {/* ✅ REDESIGNED HEADER */}
      <Header className="bg-white shadow-sm flex items-center justify-between px-6 fixed w-full z-10 h-16">
        {/* Left Side: Logo */}
        <div className="flex items-center gap-6">
          <img
            src="/gc_logo.svg"
            alt="Logo"
            className="h-10 cursor-pointer" // Adjust height as needed
          />
          {/* Vertical divider line */}
          {/* <div className="h-8 w-px bg-gray-200"></div> */}
        </div>

        {/* Right Side: Actions & User Menu */}
        <div className="flex items-center gap-4">
          {/* "How can I help you?" Action Button */}
          {/* <Button
            type="primary"
            ghost
            icon={<SearchOutlined />}
            size="large"
            className="!rounded-full !border-2 !border-blue-300 hover:!bg-blue-50"
            style={{
              background:
                "linear-gradient(to right, rgba(230, 247, 255, 0.5), rgba(240, 245, 255, 0.5))",
              color: "#4a90e2",
            }}
          >
            How can I help you?
          </Button> */}

          {/* Notification Icon */}
          <Badge count={3} size="small">
            <Avatar
              shape="circle"
              icon={<BellOutlined />}
              className="cursor-pointer bg-gray-100 text-gray-600 hover:bg-gray-200"
            />
          </Badge>

          {/* User Avatar & Dropdown */}
          <Dropdown
            menu={{ items: userMenuItems }}
            placement="bottomRight"
            trigger={["click"]}
          >
            <div className="cursor-pointer">
              <Avatar
                icon={<UserOutlined />}
                src={user?.avatarUrl}
                className="bg-blue-500 text-white"
              >
                {/* Fallback to first letter of username */}
                {user?.username?.[0]?.toUpperCase()}
              </Avatar>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout className="mt-16 h-[calc(100vh-64px)]">
        {/* Sidebar (Unchanged) */}
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          trigger={null}
          className="bg-white border-r border-gray-200"
          width={240}
          theme="light"
        >
          <div className="flex justify-end p-4 border-b border-gray-200">
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center justify-center"
            />
          </div>
          <Menu
            mode="inline"
            selectedKeys={[location.pathname]}
            items={menuItems}
            onClick={handleMenuClick}
            className="h-full border-r-0"
          />
        </Sider>

        {/* Main Content (Unchanged) */}
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
