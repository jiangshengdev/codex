import type { PropsWithChildren } from "react";
import type { I18n } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { Provider } from "react-redux";
import type { AppStore } from "@/app/store";

type TestProviderProps = PropsWithChildren<{
  i18n: I18n;
  store: AppStore;
}>;

export const TestProvider = ({ children, i18n, store }: TestProviderProps) => (
  <I18nProvider i18n={i18n}>
    <Provider store={store}>{children}</Provider>
  </I18nProvider>
);
