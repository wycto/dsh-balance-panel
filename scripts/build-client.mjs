/**
 * dsh-balance-panel 客户端打包脚本。
 *
 * 把 src/client.js 包成 web client-modules 要求的
 * `window.__ModuleLoader__.load({ id, factory })` 格式写入 lib/client.js。
 * 源码只依赖 `react`（web 平台 seed，构建期 external），因此无需 esbuild，
 * 纯文本包裹即可；若未来引入更多依赖，可换成 esbuild --bundle --format=cjs
 * 并把依赖加入 package.json 的 `dsh.client.inject`。
 *
 * 用法：node scripts/build-client.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src', 'client.js'), 'utf8')

const wrapped = `window.__ModuleLoader__.load({
\tid: "dsh-balance-panel",
\tfactory: (require) => {
\t\tvar module = { exports: {} };
\t\tvar exports = module.exports;
\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
${src}
\t\treturn module.exports;
\t}
});
`

writeFileSync(join(root, 'lib', 'client.js'), wrapped)
console.log('lib/client.js written')
