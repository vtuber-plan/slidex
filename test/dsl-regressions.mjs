import { parseSlideX, formatCsvRow } from '../dist/ir.js';
import { renderSlide } from '../dist/render/render.js';
import { buildStandaloneHtml } from '../dist/export/html.js';
import { serializeDeck } from '../dist/serializer.js';

let fails = 0;
const check = (name, cond, detail = '') => {
  if (cond) console.log('  ✓ ' + name);
  else { fails++; console.error('  ✗ ' + name + (detail ? ': ' + detail : '')); }
};

let r;
try {
  r = parseSlideX('<deck><slide><chart x="0" y="0" w="100" h="100"/></slide></deck>');
  check('空 chart 不崩溃', r.errors.some(e => e.code === 'E_ENCODE_COL'));
} catch (e) { check('空 chart 不崩溃', false, e.message); }

r = parseSlideX('<deck><slide><text x="0" y="0" w="100" h="40">ok</text><shape id="e1" x="0" y="0" w="10" h="10"/></slide></deck>');
check('缺省元素 id 自动生成且避开显式 id', r.deck.slides[0].elements[0].id === 'e2', r.deck.slides[0].elements[0].id);
check('缺省页面 id 自动生成', r.deck.slides[0].id === 'slide1', r.deck.slides[0].id);

r = parseSlideX('<deck/>');
check('空 deck 产生诊断', r.errors.some(e => e.code === 'E_DECK_EMPTY'));
check('空 deck 恢复一张可编辑页', r.deck.slides.length === 1);

r = parseSlideX('<deck><slide><chart id="c" x="0" y="0" w="100" h="100"><data cols="a,b"><row>x,1,extra</row></data><series type="bar" x="a" y="b"/></chart></slide></deck>');
check('chart 行宽校验', r.errors.some(e => e.code === 'E_ROW_LEN'));

r = parseSlideX('<deck><slide><table id="t" x="0" y="0" w="100" h="100"><cols>0.5 0.5</cols><tr><td row-span="2">x</td><td>y</td></tr></table></slide></deck>');
check('table span 越界校验', r.errors.some(e => e.code === 'E_SPAN'));

r = parseSlideX('<deck><slide><shape id="s" x="0" y="0" w="10" h="10" opacity="2"/><image id="i" x="0" y="0" w="10" h="10" src="x" crop=".8,0,.3,0"/></slide></deck>');
check('opacity 范围校验', r.errors.some(e => e.code === 'E_ATTR_RANGE' && e.message.includes('opacity')));
check('crop 范围校验', r.errors.some(e => e.code === 'E_ATTR_RANGE' && e.message.includes('crop')));

r = parseSlideX('<deck><slide><text id="t" x="0" y="0" w="100" h="40"><p style="position:fixed">x</p></text></slide></deck>');
check('非法富文本样式警告', r.warnings.some(e => e.code === 'W_STYLE_PROP'));

r = parseSlideX('<deck><slide><shape id="s" x="0" y="0" w="10" h="10"><fill type="image" src="media/a.png"/></shape></slide></deck>');
const rendered = renderSlide(r.deck, r.deck.slides[0], { mediaBase: '/f/' });
check('shape 图片填充使用 mediaBase', rendered.includes('href="/f/media/a.png"'));

r = parseSlideX('<deck><slide><text id="t" x="0" y="0" w="100" h="40"><fill type="gradient"><stop pos="0" color="#000"/><stop pos="1" color="#fff"/></fill><p>x</p></text></slide></deck>');
check('text fill 子元素被解析', r.deck.slides[0].elements[0].fillObj?.type === 'gradient');
check('text fill 不混入富文本', !r.deck.slides[0].elements[0].content.includes('<fill'));

r = parseSlideX('<deck title="&lt;/title>&lt;script>alert(1)&lt;/script>"><slide/></deck>');
const standalone = buildStandaloneHtml(r.deck, process.cwd());
check('HTML title 转义', !standalone.includes('<title></title><script>'));
r = parseSlideX('<deck><slide><image id="escape" x="0" y="0" w="10" h="10" src="../secret.png" alt="x"/></slide></deck>');
const escapedMedia = buildStandaloneHtml(r.deck, process.cwd());
check('HTML 不读取项目目录外媒体', !escapedMedia.includes('src="../secret.png"') && escapedMedia.includes('src=""'));

r = parseSlideX('<deck title="a&bogus;"><slide/></deck>');
check('未知实体报 XML 错误', r.errors.some(e => e.code === 'E_XML'));

r = parseSlideX('<deck><slide><group id="g" x="10" y="20" w="300" h="200"><shape x="0" y="0" w="50" h="50" fill="#f00"/><text id="inside" x="60" y="0" w="100" h="40">Hi</text></group><animation target="inside" effect="fade-in"/></slide></deck>');
check('group 解析嵌套元素', r.deck.slides[0].elements[0].elements?.length === 2);
check('group 子元素自动 id', r.deck.slides[0].elements[0].elements?.[0].id === 'e1');
check('动画可寻址 group 子元素', !r.warnings.some(e => e.code === 'W_ANIM_TARGET'));
check('group 渲染嵌套元素', renderSlide(r.deck, r.deck.slides[0], {}).includes('slx-group'));

const csv = formatCsvRow(['地区,城市', '值']);
r = parseSlideX(`<deck><slide><chart id="c" x="0" y="0" w="100" h="100"><data cols="${csv.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"><row>"上海,浦东",1</row></data><series type="bar" x="地区,城市" y="值"/></chart></slide></deck>`);
check('chart CSV 支持带逗号字段', r.deck.slides[0].elements[0].chartData.rows[0][0] === '上海,浦东');

r = parseSlideX('<deck><slide id="a"><shape id="link" x="0" y="0" w="10" h="10" href="slide:b" alt="Next"/></slide><slide id="b"/></deck>');
const linkHtml = renderSlide(r.deck, r.deck.slides[0], {});
check('内部页面链接校验与渲染', !r.errors.length && linkHtml.includes('data-slide-target="b"'));
check('无障碍描述渲染', linkHtml.includes('aria-label="Next"'));
r = parseSlideX('<deck><slide><image id="i" x="0" y="0" w="10" h="10" src="x"/></slide></deck>');
check('图片缺少 alt 给出警告', r.warnings.some(w => w.code === 'W_ALT_MISSING'));

r = parseSlideX('<deck><slide><shape id="locked" x="0" y="0" w="10" h="10" locked="true" lock-aspect="true"/></slide></deck>');
const lockRoundTrip = serializeDeck(r.deck);
check('锁定属性解析并序列化', r.deck.slides[0].elements[0].locked === true && r.deck.slides[0].elements[0].lockAspect === true && lockRoundTrip.includes('locked="true"') && lockRoundTrip.includes('lock-aspect="true"'));

process.exit(fails ? 1 : 0);
