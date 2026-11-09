import fileUi from '../extensions/nocobase-file-component-ui/locales/en-US.js';
import type { AppResource } from './en-US.js';
import { eduViVN } from './edu-copy.js';
import systemEnUS from './system/en-US.js';

/**
 * Vietnamese is the club's language and the application's default. NocoEdu's own pages are fully translated in
 * `./edu-copy.ts`; the template's shell and administration pages (users, permissions) are not translated yet and
 * show the English wording of `./system/` until a Vietnamese copy of that group is added.
 */
const viVN: AppResource = {
  ...systemEnUS,
  ...fileUi,
  edu: eduViVN,
};

export default viVN;
