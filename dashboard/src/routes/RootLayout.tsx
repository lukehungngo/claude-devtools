import { Outlet } from "@tanstack/react-router";
import { ThemeProvider } from "../contexts/ThemeContext";
import { SetupGate } from "../components/SetupGate";

export function RootLayout() {
  return (
    <ThemeProvider>
      <SetupGate>
        <Outlet />
      </SetupGate>
    </ThemeProvider>
  );
}
