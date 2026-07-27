import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "@tanstack/react-router";
import { setupI18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { ThemeProvider } from "./app/ThemeProvider";
import { store } from "./app/store";
import {
  bootstrapLocaleRuntime,
  LocaleRuntimeProvider,
} from "./features/locale/LocaleRuntimeProvider";
import "./index.css";
import { router } from "./router";

const container = document.getElementById("root");
const i18n = setupI18n();

const localeBootstrap = await bootstrapLocaleRuntime(i18n);

if (container) {
  const root = createRoot(container);

  root.render(
    <StrictMode>
      <ThemeProvider>
        <I18nProvider i18n={i18n}>
          <LocaleRuntimeProvider initialState={localeBootstrap}>
            <Provider store={store}>
              <RouterProvider router={router} />
            </Provider>
          </LocaleRuntimeProvider>
        </I18nProvider>
      </ThemeProvider>
    </StrictMode>,
  );
} else {
  throw new Error(
    "Root element with ID 'root' was not found in the document. Ensure there is a corresponding HTML element with the ID 'root' in your HTML file.",
  );
}
