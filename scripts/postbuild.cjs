const fs = require('fs')
const path = require('path')

const cjsDir = path.join(__dirname, '..', 'dist', 'cjs')
if (!fs.existsSync(cjsDir)) {
  fs.mkdirSync(cjsDir, { recursive: true })
}

fs.writeFileSync(
  path.join(cjsDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2),
)
