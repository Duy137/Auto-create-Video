import React from "react";

import { AutoClipVideo } from "./AutoClipVideo";
import type { VideoProps } from "./schemas/videoProps";

export const MyComposition: React.FC<VideoProps> = (props) => {
  return <AutoClipVideo {...props} />;
};
