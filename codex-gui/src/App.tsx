import { LanguageSwitcher } from "./LanguageSwitcher";
import { MsgExample } from "./MsgExample";
import { PluralExample } from "./PluralExample";
import { Counter } from "./features/counter/Counter";

function App() {
  return (
    <main className="grid min-h-svh place-items-center gap-6 bg-background px-6 py-10 text-foreground">
      <div className="fixed top-4 right-4">
        <LanguageSwitcher />
      </div>
      <Counter />
      <div className="grid justify-items-center gap-3">
        <PluralExample />
        <MsgExample />
      </div>
    </main>
  );
}

export default App;
