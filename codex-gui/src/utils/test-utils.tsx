import type { PropsWithChildren, ReactElement } from "react";
import { setupI18n } from "@lingui/core";
import { userEvent } from "vitest/browser";
import type { RenderOptions } from "vitest-browser-react";
import { render } from "vitest-browser-react";
import type { AppStore, RootState } from "@/app/store";
import { makeStore } from "@/app/store";
import { loadCatalog } from "@/i18n";
import { TestProvider } from "./TestProvider";

/**
 * This type extends the default options for
 * vitest-browser-react's render function. It allows for
 * additional configuration such as specifying an initial Redux state and
 * a custom store instance.
 */
type ExtendedRenderOptions = Omit<RenderOptions, "wrapper"> & {
  /**
   * Defines a specific portion or the entire initial state for the Redux store.
   * This is particularly useful for initializing the state in a
   * controlled manner during testing, allowing components to be rendered
   * with predetermined state conditions.
   */
  preloadedState?: Partial<RootState>;

  /**
   * Allows the use of a specific Redux store instance instead of a
   * default or global store. This flexibility is beneficial when
   * testing components with unique store requirements or when isolating
   * tests from a global store state. The custom store should be configured
   * to match the structure and middleware of the store used by the application.
   *
   * @default makeStore(preloadedState)
   */
  store?: AppStore;
};

/**
 * Renders the given React element with Redux Provider and custom store.
 * This function is useful for testing components that are connected to the Redux store.
 *
 * @param ui - The React component or element to render.
 * @param extendedRenderOptions - Optional configuration options for rendering. This includes `preloadedState` for initial Redux state and `store` for a specific Redux store instance. Any additional properties are passed to vitest-browser-react's render function.
 * @returns An object containing the Redux store used in the render, Vitest Browser user event API, and all vitest-browser-react locators for testing the component.
 */
export const renderWithProviders = async (
  ui: ReactElement,
  extendedRenderOptions: ExtendedRenderOptions = {},
) => {
  const {
    preloadedState = {},
    // Automatically create a store instance if no store was passed in
    store = makeStore(preloadedState),
    ...renderOptions
  } = extendedRenderOptions;

  const i18n = setupI18n();
  await loadCatalog("en", i18n);

  const wrapper = ({ children }: PropsWithChildren) => (
    <TestProvider i18n={i18n} store={store}>
      {children}
    </TestProvider>
  );

  const renderResult = await render(ui, { wrapper, ...renderOptions });

  return {
    store,
    user: userEvent,
    ...renderResult,
  };
};
