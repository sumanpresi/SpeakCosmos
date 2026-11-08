const fs=require('fs');
let h=fs.readFileSync('/home/claude/base.html','utf8');
const glue=fs.readFileSync('glue.js','utf8');
if(!/<\/script>\s*<\/body>/.test(h))throw new Error('no closing script');
const v=Date.now().toString(36);h=h.replace(/<\/script>\s*<\/body>/,glue.replace(/\?v=1/g,'?v='+v)+'\n</script>\n</body>');
fs.writeFileSync('out/index.html',h);
console.log('index.html',h.length);
