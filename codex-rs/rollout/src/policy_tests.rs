use crate::RolloutItem;
use codex_protocol::ThreadId;
use codex_protocol::items::ContextCompactionItem;
use codex_protocol::items::TurnItem;
use codex_protocol::protocol::EventMsg;
use codex_protocol::protocol::ItemCompletedEvent;
use codex_protocol::protocol::ThreadHistoryMode;

use super::is_persisted_rollout_item;

#[test]
fn legacy_persists_completed_context_compaction() {
    let item = RolloutItem::EventMsg(EventMsg::ItemCompleted(ItemCompletedEvent {
        thread_id: ThreadId::default(),
        turn_id: "turn".to_string(),
        item: TurnItem::ContextCompaction(ContextCompactionItem {
            id: "context-compaction".to_string(),
        }),
        started_at_ms: Some(0),
        completed_at_ms: 0,
    }));

    assert!(is_persisted_rollout_item(&item, ThreadHistoryMode::Legacy));
}
