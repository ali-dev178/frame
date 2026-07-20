import "./styles.css";
import { initControls } from "./ui/controls";
import { initCards, syncBars } from "./ui/cards";
import { initStudio } from "./ui/studio";
import { initTimeline } from "./ui/timeline";
import { initSoundtrack } from "./ui/soundtrack";

// Init order mirrors the original single-file app's top-to-bottom execution.
initControls();
initCards();
initStudio();
initTimeline();
initSoundtrack();
syncBars();
