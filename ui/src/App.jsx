import { Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Sidebar from "./components/Sidebar";
import { DialogHost } from "./components/Dialog";
import RtkAiBanner from "./components/RtkAiBanner";
import Tasks from "./pages/Tasks";
import TaskDetail from "./pages/TaskDetail";
import Queue from "./pages/Queue";
import Chat from "./pages/Chat";
import Investigate from "./pages/Investigate";
import Agents from "./pages/Agents";
import Commands from "./pages/Commands";
import Mcp from "./pages/Mcp";
import RepoHealth from "./pages/RepoHealth";
import Usage from "./pages/Usage";
import Monitor from "./pages/Monitor";
import Trading from "./pages/Trading";
import Settings from "./pages/Settings";
import Home from "./pages/Home";
import Company from "./pages/Company";
import RoomDesigner from "./pages/RoomDesigner";
import TeamChat from "./pages/TeamChat";
import Onboarding from "./components/Onboarding";
import { useTheme } from "./hooks/useTheme";

export default function App() {
  const [theme, setTheme] = useTheme();
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">
      <Onboarding />
      <Sidebar theme={theme} setTheme={setTheme} />
      <Toaster
        position="top-center"
        theme={theme === "dark" ? "dark" : "light"}
        richColors
        closeButton
        offset={0}
        toastOptions={{
          className: "FreeBird-toast",
          style: {
            fontFamily: '"Figtree", system-ui, sans-serif',
          },
        }}
      />
      <DialogHost />
      <RtkAiBanner />
      <main className="flex-1 overflow-y-auto pt-12 md:pt-0">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/co/:companyId" element={<Company />} />
          <Route path="/co/:companyId/rooms/new" element={<RoomDesigner />} />
          <Route path="/co/:companyId/team/:teamId" element={<TeamChat />} />
          <Route
            path="/co/:companyId/team/:teamId/t/:threadId"
            element={<TeamChat />}
          />
          <Route path="/co/:companyId/tasks" element={<Tasks />} />
          <Route path="/co/:companyId/queue" element={<Queue />} />
          <Route path="/co/:companyId/investigate" element={<Investigate />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/tasks/:project/:taskId" element={<TaskDetail />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/investigate" element={<Investigate />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/commands" element={<Commands />} />
          <Route path="/mcp" element={<Mcp />}>
            <Route path="global/:serverId?" element={null} />
            <Route path="company/:companyId" element={null} />
            <Route path="company/:companyId/repo/:repoId" element={null} />
            <Route path="unaffiliated/:repoId" element={null} />
          </Route>
          <Route path="/repos" element={<RepoHealth />}>
            <Route path=":name" element={null} />
            <Route path=":name/claude-md" element={null} />
          </Route>
          <Route path="/monitor" element={<Monitor />} />
          <Route path="/usage" element={<Usage />} />
          <Route path="/trading" element={<Trading />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
