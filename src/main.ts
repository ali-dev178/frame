import "./styles.css";
import { initControls } from "./ui/controls";
import { initCards, syncBars } from "./ui/cards";
import { initStudio } from "./ui/studio";
import { initTimeline } from "./ui/timeline";
import { initSoundtrack } from "./ui/soundtrack";
import { initShortcuts } from "./ui/shortcuts";
import { initMode } from "./ui/mode";
import { initPresets } from "./ui/presets";
import { maybeOfferRestore } from "./ui/restore";

// Init order mirrors the original single-file app's top-to-bottom execution.
initControls();
initCards();
initStudio();
initTimeline();
initSoundtrack();
initShortcuts();
initMode();
syncBars();

// async boot tail: presets load, then session restore (restores settings
// silently, offers media restore behind a bar, then arms autosave)
initPresets().catch(function(e){ console.error("presets failed to load", e); });
maybeOfferRestore().catch(function(e){ console.error("session restore failed", e); });
