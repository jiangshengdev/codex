import { AppShell } from "./features/appShell/AppShell";
import { useAppRuntime } from "./features/appRuntime/AppRuntimeContext";

function App() {
  const { status, commands, launchParams } = useAppRuntime();

  return <AppShell status={status} commands={commands} launchParams={launchParams} />;
}

export default App;
