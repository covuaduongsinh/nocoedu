import fileUi from '../extensions/nocobase-file-component-ui/locales/en-US.js';
import type { AppResource } from './en-US.js';
import { eduViVN } from './edu-copy.js';
import systemViVN from './system/vi-VN.js';

/**
 * Vietnamese is the club's language and the application's default. NocoEdu's own pages are fully translated in
 * `./edu-copy.ts`; the template's shell and administration pages are translated in `./system/vi-VN.ts`, which also
 * carries the club's brand in place of the template's (a template upgrade replaces `./system/`: re-apply it).
 */
const viVN: AppResource = {
  ...systemViVN,
  ...fileUi,
  edu: eduViVN,
};

export default viVN;
