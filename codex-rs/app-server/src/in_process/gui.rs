use std::io;
use std::io::Error as IoError;
use std::io::ErrorKind;
use std::sync::Arc;

use codex_gui_host::GuiLaunchUrls;
use codex_protocol::ThreadId;
use tokio::sync::mpsc;
use tokio::sync::oneshot;

use crate::gui_connection_bridge::ExtraConnectionLocalGuiOpener;
use crate::gui_launch_service::AppServerGuiLaunchService;
use crate::gui_launch_service::GuiLaunchServiceError;
use crate::in_process_extra::ExtraConnectionCommandSender;

use super::InProcessClientMessage;
use super::ProcessorCommand;

pub(crate) type PendingResponse = Result<GuiLaunchUrls, GuiLaunchServiceError>;

pub(crate) enum ClientCommand {
    Launch {
        thread_id: ThreadId,
        response_tx: oneshot::Sender<PendingResponse>,
    },
}

pub(super) enum ProcessorGuiCommand {
    Launch {
        thread_id: ThreadId,
        response_tx: oneshot::Sender<PendingResponse>,
    },
}

pub(super) async fn launch_for_thread(
    client_tx: &mpsc::Sender<InProcessClientMessage>,
    thread_id: ThreadId,
) -> io::Result<PendingResponse> {
    let (response_tx, response_rx) = oneshot::channel();
    client_tx
        .try_send(InProcessClientMessage::Gui(ClientCommand::Launch {
            thread_id,
            response_tx,
        }))
        .map_err(|err| match err {
            mpsc::error::TrySendError::Full(_) => {
                IoError::new(ErrorKind::WouldBlock, "in-process GUI launch queue is full")
            }
            mpsc::error::TrySendError::Closed(_) => IoError::new(
                ErrorKind::BrokenPipe,
                "in-process app-server runtime is closed",
            ),
        })?;

    response_rx.await.map_err(|err| {
        IoError::new(
            ErrorKind::BrokenPipe,
            format!("in-process GUI launch response channel closed: {err}"),
        )
    })
}

pub(super) fn launch_service(
    client_tx: mpsc::Sender<InProcessClientMessage>,
) -> Arc<AppServerGuiLaunchService> {
    Arc::new(AppServerGuiLaunchService::new_with_default_config(
        Arc::new(ExtraConnectionLocalGuiOpener::new(
            ExtraConnectionCommandSender::new(client_tx),
        )),
    ))
}

#[derive(Debug, PartialEq, Eq)]
pub(super) enum ForwardOutcome {
    Continue,
    Break,
}

pub(super) fn forward_to_processor(
    command: ClientCommand,
    processor_tx: &mpsc::Sender<ProcessorCommand>,
) -> ForwardOutcome {
    let ClientCommand::Launch {
        thread_id,
        response_tx,
    } = command;

    match processor_tx.try_send(ProcessorCommand::Gui(ProcessorGuiCommand::Launch {
        thread_id,
        response_tx,
    })) {
        Ok(()) => ForwardOutcome::Continue,
        Err(mpsc::error::TrySendError::Full(ProcessorCommand::Gui(
            ProcessorGuiCommand::Launch { response_tx, .. },
        ))) => {
            let _ = response_tx.send(Err(GuiLaunchServiceError::Unavailable {
                message: "in-process app-server request queue is full".to_string(),
            }));
            ForwardOutcome::Continue
        }
        Err(mpsc::error::TrySendError::Full(_)) => {
            unreachable!("GUI launch send returned a different command")
        }
        Err(mpsc::error::TrySendError::Closed(ProcessorCommand::Gui(
            ProcessorGuiCommand::Launch { response_tx, .. },
        ))) => {
            let _ = response_tx.send(Err(GuiLaunchServiceError::Unavailable {
                message: "in-process app-server request processor is closed".to_string(),
            }));
            ForwardOutcome::Break
        }
        Err(mpsc::error::TrySendError::Closed(_)) => {
            unreachable!("GUI launch send returned a different command")
        }
    }
}

pub(super) async fn handle_processor_command(
    service: &AppServerGuiLaunchService,
    command: ProcessorGuiCommand,
) {
    let ProcessorGuiCommand::Launch {
        thread_id,
        response_tx,
    } = command;
    let result = service.launch_urls_for_thread(thread_id).await;
    let _ = response_tx.send(result);
}
