import type { PayloadAction } from "@reduxjs/toolkit";
import { createAppSlice } from "@/app/createAppSlice";

export type GuiThreadAttachStatus = "none" | "attached" | "mismatch";

export type GuiThreadIdentityState = {
  launchThreadId: string | null;
  attachedThreadId: string | null;
  attachStatus: GuiThreadAttachStatus;
};

const initialState: GuiThreadIdentityState = {
  launchThreadId: null,
  attachedThreadId: null,
  attachStatus: "none",
};

export const threadIdentitySlice = createAppSlice({
  name: "threadIdentity",
  initialState,
  reducers: (create) => ({
    launchThreadIdRecorded: create.reducer((state, action: PayloadAction<string>) => {
      state.launchThreadId = action.payload;
      state.attachedThreadId = null;
      state.attachStatus = "none";
    }),
    attachedThreadIdObserved: create.reducer((state, action: PayloadAction<string>) => {
      state.attachedThreadId = action.payload;
      if (state.launchThreadId == null) {
        state.attachStatus = "none";
      } else if (state.launchThreadId === action.payload) {
        state.attachStatus = "attached";
      } else {
        state.attachStatus = "mismatch";
      }
    }),
  }),
  selectors: {
    selectThreadIdentityState: (threadIdentity) => threadIdentity,
    selectCanAdvanceThreadIdentity: (threadIdentity) => threadIdentity.attachStatus === "attached",
  },
});

export const { attachedThreadIdObserved, launchThreadIdRecorded } = threadIdentitySlice.actions;

export const { selectCanAdvanceThreadIdentity, selectThreadIdentityState } =
  threadIdentitySlice.selectors;

export default threadIdentitySlice;
