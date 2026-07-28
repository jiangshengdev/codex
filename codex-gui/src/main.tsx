import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "@tanstack/react-router";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ThemeProvider } from "./app/ThemeProvider";
import { store } from "./app/store";
import { loadCatalog, resolveInitialLocale } from "./i18n";
import "./index.css";
import { router } from "./router";

const container = document.getElementById("root");
const i18n = setupI18n();

await loadCatalog(resolveInitialLocale(), i18n);

if (container) {
  const root = createRoot(container);

  root.render(
    <StrictMode>
      <ThemeProvider>
        <I18nProvider i18n={i18n}>
          <Provider store={store}>
            <RouterProvider router={router} />
          </Provider>
        </I18nProvider>
      </ThemeProvider>
    </StrictMode>,
  );
} else {
  throw new Error(
    "Root element with ID 'root' was not found in the document. Ensure there is a corresponding HTML element with the ID 'root' in your HTML file.",
  );
}
