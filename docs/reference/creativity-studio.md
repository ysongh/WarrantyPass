# design-standalone.md — Creativity Studio design system

> **Status in this repo: reference only. Not WarrantyPass's design system.**
>
> This document describes a different product — a creative agency's marketing
> site — and is kept purely as inspiration. Nothing here is implemented, and
> its rules are not binding on WarrantyPass code.
>
> WarrantyPass's actual design system is [`docs/design-system.md`](../design-system.md),
> which records what we borrowed from this file and what we deliberately did not.
> Do not copy tokens, components, or rules out of this document into `src/`
> without checking that file first.

**Self-contained.** This one file is the entire design system: the full token CSS and the source of all 19 components are inlined below. No other files are needed.

Provenance: reverse-engineered from a single flattened JPEG landing-page comp for an unnamed creative agency that styles itself "design studio". Every value was measured off that image — not read from code or Figma. Read "Known substitutions" at the end before shipping to production.

## How to install

1. Create `design/styles.css` and paste the CSS block in **§1** into it verbatim. Link it once, globally: `<link rel="stylesheet" href="design/styles.css">` (or `@import` it from your root stylesheet). Never redeclare a token locally.
2. Create the component files in **§2** under `design/components/<group>/<Name>.jsx`. They are plain React — React-only imports, no npm dependencies, styled entirely through the CSS custom properties from §1. Siblings import each other by relative path; keep the group folders as named.
3. Follow the rules in **§3** onward. They are enforceable — copy exact values, never round or snap them to a 4/8px grid or a framework default.

If you only need a subset, take §1 (always required) plus whichever components you use — but keep `Icon` if you take anything that renders a glyph.

---

## §1 — Tokens (the complete stylesheet)

```css
/* ==== design/styles.css — paste verbatim; this IS the system ==== */

/* Fonts. Google Fonts substitutions — see "Known substitutions" below. */
@import url("https://fonts.googleapis.com/css2?family=Bakbak+One&family=Poppins:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap");

:root{
/* --- Brand base --- */
--orange-100:#FFE9DF;--orange-200:#FFCDB6;--orange-300:#FFA87F;--orange-400:#FF8A4C;--orange-500:#F4562A;--orange-600:#DC431A;
--yellow-300:#FFE071;--yellow-400:#FFC93C;--yellow-500:#F7C21B;
--mint-100:#EAF8F6;--mint-200:#D6F0EC;--mint-300:#A9D9D2;--mint-400:#7FC3BA;
--peach-100:#FDF2EA;--peach-200:#FDE3D2;
/* --- Ink / neutrals --- */
--ink-900:#2C363F;--ink-700:#3D4A54;--ink-500:#63707B;--ink-400:#7A8894;--ink-300:#A7B2BC;--ink-200:#D9E0E6;--ink-100:#EDF1F4;
--white:#FFFFFF;--page:#F8F9FB;
/* --- Service tile gradients (six-up "What we do here" grid) --- */
--tile-1a:#29B6F6;--tile-1b:#2D7BF6;
--tile-2a:#25D8C4;--tile-2b:#22A6E8;
--tile-3a:#7BE39A;--tile-3b:#3FC98C;
--tile-4a:#B23BF0;--tile-4b:#E93BC2;
--tile-5a:#FF7A3D;--tile-5b:#F03B2D;
--tile-6a:#FFB27A;--tile-6b:#FF8A4C;

/* --- Semantic aliases --- */
--text-display:var(--ink-700);--text-heading:var(--ink-700);--text-body:var(--ink-400);--text-muted:var(--ink-300);
--text-eyebrow:var(--orange-500);--text-on-accent:var(--white);
--link:var(--orange-500);--link-hover:var(--orange-600);
--surface-page:var(--page);--surface-card:var(--white);--surface-mint:var(--mint-100);--surface-peach:var(--peach-100);
--accent:var(--orange-500);--accent-hover:var(--orange-600);--accent-soft:var(--orange-100);
--highlight:var(--yellow-400);
--border-hairline:var(--ink-100);--border-input:var(--ink-200);
--focus-ring:rgba(244,86,42,.35);
--gradient-accent:linear-gradient(135deg,var(--orange-400) 0%,var(--orange-500) 100%);
--gradient-accent-hover:linear-gradient(135deg,#FF7A3B 0%,var(--orange-600) 100%);
--blob-peach:#FDE3D2;--blob-gray:#E6ECEF;--blob-mint:#CFE8E3;--blob-cream:#FBF3E9;
}

:root{
--font-display:"Bakbak One","Poppins",system-ui,sans-serif;
--font-sans:"Poppins",system-ui,-apple-system,sans-serif;
--font-mono:ui-monospace,SFMono-Regular,Menlo,monospace;

--text-hero:88px;--text-hero-sub:34px;
--text-h1:40px;--text-h2:32px;--text-h3:22px;--text-h4:17px;
--text-body-lg:16px;--text-body:15px;--text-sm:13px;--text-xs:11px;

--leading-tight:1.0;--leading-snug:1.25;--leading-normal:1.5;--leading-relaxed:1.75;
--weight-light:300;--weight-regular:400;--weight-medium:500;--weight-semibold:600;--weight-bold:700;
--tracking-display:-.01em;--tracking-normal:0;--tracking-wide:.06em;--tracking-eyebrow:.14em;

/* semantic */
--type-hero:var(--weight-regular) var(--text-hero)/var(--leading-tight) var(--font-display);
--type-hero-sub:var(--weight-regular) var(--text-hero-sub)/1.15 var(--font-display);
--type-h1:var(--weight-semibold) var(--text-h1)/var(--leading-snug) var(--font-sans);
--type-h2:var(--weight-semibold) var(--text-h2)/var(--leading-snug) var(--font-sans);
--type-h3:var(--weight-semibold) var(--text-h3)/1.35 var(--font-sans);
--type-body:var(--weight-regular) var(--text-body)/var(--leading-relaxed) var(--font-sans);
--type-sm:var(--weight-regular) var(--text-sm)/var(--leading-relaxed) var(--font-sans);
--type-button:var(--weight-semibold) var(--text-sm)/1 var(--font-sans);
--type-nav:var(--weight-medium) 14px/1 var(--font-sans);
--type-eyebrow:var(--weight-semibold) var(--text-sm)/1.2 var(--font-sans);
}

:root{
--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;--space-8:32px;--space-10:40px;--space-12:48px;--space-16:64px;--space-20:80px;--space-24:96px;--space-32:128px;
--section-y:128px;--section-y-tight:96px;
--container:1140px;--container-narrow:720px;
--gutter:24px;
--grid-cols:12; /* @kind other */
}

:root{
/* radii */
--radius-xs:6px;--radius-sm:10px;--radius-md:14px;--radius-lg:20px;--radius-xl:28px;--radius-2xl:40px;--radius-pill:999px;
--radius-media:24px;--radius-media-accent:140px; /* the one oversized corner on framed photography */

/* shadows */
--shadow-xs:0 2px 6px rgba(44,54,63,.06);
--shadow-sm:0 6px 16px rgba(44,54,63,.07);
--shadow-card:0 24px 60px rgba(58,74,90,.10);
--shadow-card-hover:0 32px 72px rgba(58,74,90,.14);
--shadow-media:0 30px 70px rgba(58,74,90,.18);
--shadow-tile:0 10px 22px rgba(44,54,63,.12);
--glow-accent:0 10px 24px rgba(244,86,42,.35);
--glow-accent-hover:0 14px 30px rgba(244,86,42,.45);
--inset-hairline:inset 0 0 0 1px var(--border-hairline);

/* motion */
--ease-out:cubic-bezier(.22,.61,.36,1); /* @kind other */
--ease-in-out:cubic-bezier(.45,.05,.55,.95); /* @kind other */
--dur-fast:140ms; /* @kind other */
--dur-base:220ms; /* @kind other */
--dur-slow:420ms; /* @kind other */
--transition-base:all var(--dur-base) var(--ease-out);

/* blur / transparency */
--blur-nav:saturate(140%) blur(14px); /* @kind other */
--scrim-white:rgba(255,255,255,.82);
--opacity-hover:.7; /* @kind other */
--opacity-disabled:.4; /* @kind other */
--press-scale:.97; /* @kind other */
}

*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:var(--surface-page);color:var(--text-body);font:var(--type-body);-webkit-font-smoothing:antialiased;text-wrap:pretty}
h1,h2,h3,h4{color:var(--text-heading);margin:0}
h1{font:var(--type-h1)}h2{font:var(--type-h2)}h3{font:var(--type-h3)}
p{margin:0}
a{color:var(--link);text-decoration:none}
a:hover{color:var(--link-hover);text-decoration:underline;text-underline-offset:3px}
::selection{background:var(--orange-200);color:var(--ink-900)}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
```

---

## §2 — Components (complete source)

19 components in four groups. Every one takes an optional `style` prop that merges last, so callers can position without forking the component.

| Group | Path | Components |
| --- | --- | --- |
| Core | `design/components/core/` | Icon, Button, IconButton, Badge, Tag, Card |
| Forms | `design/components/forms/` | Input, Select, Checkbox, Switch |
| Navigation | `design/components/navigation/` | NavBar, CarouselNav |
| Marketing | `design/components/marketing/` | DisplayHeading, SectionHeading, ServiceCard, MediaFrame, TestimonialCard, LogoStrip, BlobField |

Each block below omits the import lines — add `import React from 'react';` at the top of every file, plus these relative imports where noted:

- `forms/Select.jsx`, `forms/Checkbox.jsx` → `import {Icon} from '../core/Icon.jsx';`
- `navigation/CarouselNav.jsx` → `import {IconButton} from '../core/IconButton.jsx';` and `import {Icon} from '../core/Icon.jsx';`
- `marketing/SectionHeading.jsx` → `import {Badge} from '../core/Badge.jsx';`

#### Icon

```jsx
/* The source comp is a flattened image, so no icon binaries existed to copy.
   Substitution: Lucide (lucide-static via unpkg) — 2px-stroke rounded outline,
   the closest match to the thin rounded glyphs in the comp.
   The SVG source is fetched once per name and inlined, so glyphs survive
   screenshot/PDF/PPTX capture (a CSS mask would flatten to a solid square). */
const CDN='https://unpkg.com/lucide-static@0.470.0/icons/';
const cache={};

export function Icon({name,size=18,color='currentColor',strokeWidth=2,style}){
  const [svg,setSvg]=React.useState(cache[name]||null);
  React.useEffect(()=>{
    if(cache[name]){setSvg(cache[name]);return}
    let live=true;
    fetch(CDN+name+'.svg').then(r=>r.ok?r.text():'').then(t=>{
      if(!t)return;
      cache[name]=t;if(live)setSvg(t);
    }).catch(()=>{});
    return()=>{live=false};
  },[name]);
  const markup=svg&&svg.replace(/width="24"/,`width="${size}"`).replace(/height="24"/,`height="${size}"`)
    .replace(/stroke-width="[^"]*"/,`stroke-width="${strokeWidth}"`);
  return <span aria-hidden="true" data-icon={name}
    style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:size,height:size,color,flex:'none',...style}}
    dangerouslySetInnerHTML={markup?{__html:markup}:undefined} />;
}
```

#### Button

```jsx
const sizes={sm:{padding:'10px 22px',font:'var(--type-button)'},md:{padding:'14px 30px',font:'var(--type-button)'},lg:{padding:'17px 38px',fontSize:'15px',fontWeight:600}};

export function Button({variant='primary',size='md',disabled=false,iconRight,iconLeft,onClick,href,children,style,...rest}){
  const [hover,setHover]=React.useState(false);const [press,setPress]=React.useState(false);
  const base={display:'inline-flex',alignItems:'center',gap:'10px',border:'none',cursor:disabled?'not-allowed':'pointer',fontFamily:'var(--font-sans)',fontWeight:600,fontSize:'13px',letterSpacing:'.01em',borderRadius:'var(--radius-pill)',transition:'var(--transition-base)',textDecoration:'none',opacity:disabled?'var(--opacity-disabled)':1,transform:press&&!disabled?'scale(var(--press-scale))':'none',...sizes[size]};
  const variants={
    primary:{background:hover&&!disabled?'var(--gradient-accent-hover)':'var(--gradient-accent)',color:'var(--text-on-accent)',boxShadow:disabled?'none':(hover?'var(--glow-accent-hover)':'var(--glow-accent)')},
    secondary:{background:'var(--white)',color:'var(--ink-700)',boxShadow:hover?'var(--shadow-sm)':'var(--shadow-xs)'},
    outline:{background:'transparent',color:hover?'var(--accent-hover)':'var(--accent)',boxShadow:'inset 0 0 0 1.5px currentColor'},
    ghost:{background:hover?'var(--accent-soft)':'transparent',color:'var(--accent)',boxShadow:'none'}
  };
  const Tag=href?'a':'button';
  return <Tag href={href} onClick={disabled?undefined:onClick} disabled={Tag==='button'?disabled:undefined}
    onMouseEnter={()=>setHover(true)} onMouseLeave={()=>{setHover(false);setPress(false)}}
    onMouseDown={()=>setPress(true)} onMouseUp={()=>setPress(false)}
    style={{...base,...variants[variant],...style}} {...rest}>
    {iconLeft}{children}{iconRight}
  </Tag>;
}
```

#### IconButton

```jsx
const sizes={sm:34,md:44,lg:54};

export function IconButton({variant='light',size='md',label,onClick,children,style}){
  const [hover,setHover]=React.useState(false);const d=sizes[size];
  const variants={
    light:{background:'var(--white)',color:'var(--accent)',boxShadow:hover?'var(--shadow-sm)':'var(--shadow-xs)'},
    accent:{background:'var(--gradient-accent)',color:'var(--white)',boxShadow:hover?'var(--glow-accent-hover)':'var(--glow-accent)'},
    outline:{background:'transparent',color:hover?'var(--accent)':'var(--ink-300)',boxShadow:'inset 0 0 0 1.5px currentColor'}
  };
  return <button aria-label={label} onClick={onClick} onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
    style={{width:d,height:d,display:'inline-flex',alignItems:'center',justifyContent:'center',border:'none',borderRadius:'var(--radius-pill)',cursor:'pointer',transition:'var(--transition-base)',...variants[variant],...style}}>{children}</button>;
}
```

#### Badge

```jsx
export function Badge({tone='accent',uppercase=false,children,style}){
  const tones={accent:{color:'var(--accent)',background:'transparent'},soft:{color:'var(--accent)',background:'var(--accent-soft)'},mint:{color:'#2E8C81',background:'var(--mint-200)'},neutral:{color:'var(--ink-500)',background:'var(--ink-100)'}};
  const bare=tones[tone].background==='transparent';
  return <span style={{display:'inline-block',font:'var(--type-eyebrow)',letterSpacing:uppercase?'var(--tracking-eyebrow)':'.01em',textTransform:uppercase?'uppercase':'none',padding:bare?0:'6px 14px',borderRadius:'var(--radius-pill)',...tones[tone],...style}}>{children}</span>;
}
```

#### Tag

```jsx
export function Tag({tone='neutral',onRemove,children,style}){
  const tones={neutral:{background:'var(--ink-100)',color:'var(--ink-500)'},accent:{background:'var(--accent-soft)',color:'var(--orange-600)'},mint:{background:'var(--mint-200)',color:'#2E8C81'},yellow:{background:'var(--yellow-300)',color:'var(--ink-900)'}};
  return <span style={{display:'inline-flex',alignItems:'center',gap:8,font:'var(--type-sm)',fontWeight:500,lineHeight:1,padding:'8px 14px',borderRadius:'var(--radius-pill)',...tones[tone],...style}}>
    {children}
    {onRemove&&<button onClick={onRemove} aria-label="Remove" style={{border:'none',background:'transparent',color:'inherit',cursor:'pointer',padding:0,fontSize:14,lineHeight:1,opacity:.6}}>×</button>}
  </span>;
}
```

#### Card

```jsx
const pads={sm:'24px',md:'40px',lg:'64px 72px'};

export function Card({padding='md',elevation='card',interactive=false,children,style}){
  const [hover,setHover]=React.useState(false);
  const shadows={none:'var(--inset-hairline)',sm:'var(--shadow-sm)',card:'var(--shadow-card)'};
  return <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
    style={{background:'var(--surface-card)',borderRadius:'var(--radius-xl)',padding:pads[padding],
      boxShadow:interactive&&hover?'var(--shadow-card-hover)':shadows[elevation],
      transform:interactive&&hover?'translateY(-3px)':'none',transition:'var(--transition-base)',...style}}>{children}</div>;
}
```

#### Input

```jsx
export function Input({shape='pill',size='md',placeholder,value,onChange,type='text',disabled,invalid,iconLeft,trailing,style}){
  const [focus,setFocus]=React.useState(false);
  const pad=size==='lg'?'20px 26px':size==='sm'?'11px 18px':'15px 22px';
  return <div style={{display:'flex',alignItems:'center',gap:12,background:'var(--white)',
    borderRadius:shape==='pill'?'var(--radius-pill)':'var(--radius-md)',padding:pad,
    boxShadow:focus?'inset 0 0 0 1.5px var(--accent), 0 0 0 4px var(--focus-ring)':(invalid?'inset 0 0 0 1.5px var(--orange-500)':'inset 0 0 0 1px var(--border-input)'),
    opacity:disabled?'var(--opacity-disabled)':1,transition:'var(--transition-base)',...style}}>
    {iconLeft&&<span style={{color:'var(--ink-300)',display:'flex'}}>{iconLeft}</span>}
    <input type={type} placeholder={placeholder} value={value} onChange={onChange} disabled={disabled}
      onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
      style={{flex:1,border:'none',outline:'none',background:'transparent',font:'var(--type-body)',color:'var(--ink-700)',minWidth:0}} />
    {trailing}
  </div>;
}
```

#### Select

```jsx
export function Select({options=[],value,onChange,placeholder='Select…',shape='pill',disabled,style}){
  const [focus,setFocus]=React.useState(false);
  return <div style={{position:'relative',display:'inline-flex',alignItems:'center',background:'var(--white)',
    borderRadius:shape==='pill'?'var(--radius-pill)':'var(--radius-md)',padding:'15px 22px',
    boxShadow:focus?'inset 0 0 0 1.5px var(--accent), 0 0 0 4px var(--focus-ring)':'inset 0 0 0 1px var(--border-input)',
    opacity:disabled?'var(--opacity-disabled)':1,transition:'var(--transition-base)',...style}}>
    <select value={value} onChange={onChange} disabled={disabled} onFocus={()=>setFocus(true)} onBlur={()=>setFocus(false)}
      style={{appearance:'none',border:'none',outline:'none',background:'transparent',font:'var(--type-body)',color:value?'var(--ink-700)':'var(--ink-300)',paddingRight:28,flex:1,cursor:'pointer'}}>
      <option value="">{placeholder}</option>
      {options.map(o=><option key={o.value??o} value={o.value??o}>{o.label??o}</option>)}
    </select>
    <Icon name="chevron-down" size={16} color="var(--ink-300)" style={{position:'absolute',right:22,pointerEvents:'none'}} />
  </div>;
}
```

#### Checkbox

```jsx
export function Checkbox({checked=false,onChange,label,disabled,style}){
  return <label style={{display:'inline-flex',alignItems:'center',gap:12,cursor:disabled?'not-allowed':'pointer',opacity:disabled?'var(--opacity-disabled)':1,font:'var(--type-sm)',color:'var(--ink-500)',...style}}>
    <span style={{width:20,height:20,borderRadius:'var(--radius-xs)',flex:'none',display:'grid',placeItems:'center',
      background:checked?'var(--gradient-accent)':'var(--white)',
      boxShadow:checked?'var(--glow-accent)':'inset 0 0 0 1.5px var(--border-input)',transition:'var(--transition-base)'}}>
      {checked&&<Icon name="check" size={13} color="#fff" />}
    </span>
    <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} style={{position:'absolute',opacity:0,width:0,height:0}} />
    {label}
  </label>;
}
```

#### Switch

```jsx
export function Switch({checked=false,onChange,label,disabled,style}){
  return <label style={{display:'inline-flex',alignItems:'center',gap:12,cursor:disabled?'not-allowed':'pointer',opacity:disabled?'var(--opacity-disabled)':1,font:'var(--type-sm)',color:'var(--ink-500)',...style}}>
    <span onClick={()=>!disabled&&onChange&&onChange(!checked)} style={{width:46,height:26,borderRadius:'var(--radius-pill)',flex:'none',padding:3,display:'flex',
      background:checked?'var(--gradient-accent)':'var(--ink-200)',boxShadow:checked?'var(--glow-accent)':'none',transition:'var(--transition-base)'}}>
      <span style={{width:20,height:20,borderRadius:'var(--radius-pill)',background:'var(--white)',boxShadow:'var(--shadow-xs)',transform:checked?'translateX(20px)':'none',transition:'transform var(--dur-base) var(--ease-out)'}} />
    </span>
    {label}
  </label>;
}
```

#### NavBar

```jsx
export function NavBar({brand='design studio',links=[],activeIndex=0,onNavigate,right,sticky=false,style}){
  return <nav style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:40,
    maxWidth:'var(--container)',margin:'0 auto',padding:'26px var(--gutter)',position:sticky?'sticky':'static',top:0,zIndex:20,
    background:sticky?'var(--scrim-white)':'transparent',backdropFilter:sticky?'var(--blur-nav)':'none',...style}}>
    <span style={{fontFamily:'var(--font-display)',fontSize:20,color:'var(--ink-700)',letterSpacing:'.02em',whiteSpace:'nowrap'}}>{brand}</span>
    <div style={{display:'flex',alignItems:'center',gap:36}}>
      {links.map((l,i)=><a key={l} href="#" onClick={e=>{e.preventDefault();onNavigate&&onNavigate(i)}}
        style={{font:'var(--type-nav)',color:i===activeIndex?'var(--ink-700)':'var(--ink-400)',textDecoration:'none',transition:'var(--transition-base)'}}>{l}</a>)}
    </div>
    <div style={{display:'flex',alignItems:'center',gap:18}}>{right}</div>
  </nav>;
}
```

#### CarouselNav

```jsx
export function CarouselNav({index=0,count=3,onChange,showDots=false,style}){
  const go=n=>onChange&&onChange(Math.max(0,Math.min(count-1,n)));
  return <div style={{display:'flex',alignItems:'center',gap:14,...style}}>
    <IconButton variant="outline" size="sm" label="Previous" onClick={()=>go(index-1)}><Icon name="chevron-left" size={15} /></IconButton>
    <IconButton variant="outline" size="sm" label="Next" onClick={()=>go(index+1)}><Icon name="chevron-right" size={15} /></IconButton>
    {showDots&&<div style={{display:'flex',gap:7,marginLeft:6}}>
      {Array.from({length:count}).map((_,i)=><span key={i} onClick={()=>go(i)} style={{width:i===index?18:7,height:7,borderRadius:'var(--radius-pill)',background:i===index?'var(--accent)':'var(--ink-200)',cursor:'pointer',transition:'var(--transition-base)'}} />)}
    </div>}
  </div>;
}
```

#### DisplayHeading

```jsx
export function DisplayHeading({children,sub,size=88,align='left',style}){
  return <div style={{textAlign:align,...style}}>
    <div style={{fontFamily:'var(--font-display)',fontSize:size,lineHeight:'var(--leading-tight)',color:'var(--text-display)',letterSpacing:'var(--tracking-display)'}}>{children}</div>
    {sub&&<div style={{fontFamily:'var(--font-display)',fontSize:Math.round(size*0.36),lineHeight:1.2,color:'var(--ink-500)',marginTop:14,fontWeight:400}}>{sub}</div>}
  </div>;
}
```

#### SectionHeading

```jsx
export function SectionHeading({eyebrow,title,body,align='left',size='h1',style}){
  const fonts={h1:'var(--type-h1)',h2:'var(--type-h2)'};
  return <div style={{textAlign:align,maxWidth:align==='center'?620:460,margin:align==='center'?'0 auto':0,...style}}>
    {eyebrow&&<Badge style={{marginBottom:12,display:'block'}}>{eyebrow}</Badge>}
    <h2 style={{font:fonts[size],color:'var(--text-heading)',margin:0}}>{title}</h2>
    {body&&<p style={{font:'var(--type-body)',color:'var(--text-body)',marginTop:18}}>{body}</p>}
  </div>;
}
```

#### ServiceCard

```jsx
const ramps={1:['var(--tile-1a)','var(--tile-1b)'],2:['var(--tile-2a)','var(--tile-2b)'],3:['var(--tile-3a)','var(--tile-3b)'],4:['var(--tile-4a)','var(--tile-4b)'],5:['var(--tile-5a)','var(--tile-5b)'],6:['var(--tile-6a)','var(--tile-6b)']};

export function ServiceCard({icon,title,body,ramp=1,align='center',style}){
  const [hover,setHover]=React.useState(false);const [a,b]=ramps[ramp]||ramps[1];
  return <div onMouseEnter={()=>setHover(true)} onMouseLeave={()=>setHover(false)}
    style={{textAlign:align,padding:'34px 30px',transition:'var(--transition-base)',transform:hover?'translateY(-4px)':'none',...style}}>
    <div style={{width:54,height:54,borderRadius:'var(--radius-md)',margin:align==='center'?'0 auto 22px':'0 0 22px',
      background:`linear-gradient(135deg,${a} 0%,${b} 100%)`,boxShadow:hover?'var(--shadow-card)':'var(--shadow-tile)',
      display:'grid',placeItems:'center',color:'#fff',transition:'var(--transition-base)'}}>{icon}</div>
    <h3 style={{font:'var(--weight-semibold) 16px/1.4 var(--font-sans)',color:'var(--ink-700)',margin:0}}>{title}</h3>
    <p style={{font:'var(--type-sm)',color:'var(--text-body)',marginTop:10}}>{body}</p>
  </div>;
}
```

#### MediaFrame

```jsx
export function MediaFrame({src,alt='',accentCorner='top-right',accentBlock=true,dots=false,width='100%',height=380,style}){
  const radii={'top-right':'var(--radius-media) var(--radius-media-accent) var(--radius-media) var(--radius-media)',
    'top-left':'var(--radius-media-accent) var(--radius-media) var(--radius-media) var(--radius-media)',
    none:'var(--radius-media)'};
  return <div style={{position:'relative',width,...style}}>
    {dots&&<div style={{position:'absolute',right:-40,top:-24,width:120,height:150,
      backgroundImage:'radial-gradient(var(--ink-200) 1.6px, transparent 1.6px)',backgroundSize:'12px 12px',zIndex:0}} />}
    {accentBlock&&<div style={{position:'absolute',left:-26,bottom:-26,width:96,height:96,borderRadius:'var(--radius-sm) 0 0 var(--radius-sm)',background:'var(--yellow-400)',zIndex:0}} />}
    <img src={src} alt={alt} style={{position:'relative',zIndex:1,display:'block',width:'100%',height,objectFit:'cover',
      borderRadius:radii[accentCorner],boxShadow:'var(--shadow-media)',background:'var(--white)'}} />
  </div>;
}
```

#### TestimonialCard

```jsx
export function TestimonialCard({quote,name,role,avatar,align='center',style}){
  return <div style={{textAlign:align,maxWidth:420,margin:align==='center'?'0 auto':0,...style}}>
    {avatar&&<img src={avatar} alt={name} style={{width:84,height:84,borderRadius:'var(--radius-pill)',objectFit:'cover',border:'5px solid var(--white)',boxShadow:'var(--shadow-card)',marginBottom:26}} />}
    <p style={{font:'var(--weight-regular) 15px/1.9 var(--font-sans)',fontStyle:'italic',color:'var(--ink-500)',margin:0}}>{quote}</p>
    <div style={{marginTop:22,font:'var(--weight-semibold) 13px/1.4 var(--font-sans)',color:'var(--ink-700)'}}>{name}</div>
    <div style={{font:'var(--type-sm)',color:'var(--text-muted)'}}>{role}</div>
  </div>;
}
```

#### LogoStrip

```jsx
export function LogoStrip({label='Trusted by',items=[],style}){
  return <div style={{display:'flex',alignItems:'center',gap:44,flexWrap:'wrap',...style}}>
    {label&&<div style={{display:'flex',alignItems:'center',gap:14,font:'var(--type-sm)',fontWeight:500,color:'var(--ink-500)',whiteSpace:'nowrap'}}>
      {label}<span style={{width:38,height:1,background:'var(--ink-200)'}} /></div>}
    {items.map((it,i)=>typeof it==='string'
      ? <span key={i} style={{font:'var(--weight-semibold) 15px/1 var(--font-sans)',letterSpacing:'.08em',textTransform:'uppercase',color:'var(--ink-300)'}}>{it}</span>
      : <img key={i} src={it.src} alt={it.alt||''} style={{height:it.height||24,opacity:.75,filter:'grayscale(1)'}} />)}
  </div>;
}
```

#### BlobField

```jsx
/* The comp's background is built from large soft organic shapes in peach, pale
   grey and mint, plus dot grids. Reproduced with blurred radial shapes so no
   brand artwork is redrawn. */
export function BlobField({density='medium',tone='peach',dots=true,style,children}){
  const tones={peach:['var(--blob-peach)','var(--blob-cream)','var(--blob-gray)'],mint:['var(--blob-mint)','var(--blob-cream)','var(--blob-gray)'],grey:['var(--blob-gray)','var(--ink-100)','var(--blob-cream)']};
  const [c1,c2,c3]=tones[tone];const n=density==='low'?2:density==='high'?5:3;
  const spots=[{t:'-14%',l:'-16%',w:620,h:520,c:c1,r:'52% 48% 60% 40%/44% 56% 44% 56%'},
    {t:'6%',l:'80%',w:520,h:620,c:c2,r:'60% 40% 44% 56%/56% 44% 60% 40%'},
    {t:'62%',l:'-20%',w:560,h:560,c:c3,r:'44% 56% 52% 48%/60% 40% 56% 44%'},
    {t:'74%',l:'72%',w:640,h:480,c:c1,r:'56% 44% 40% 60%/48% 52% 44% 56%'},
    {t:'40%',l:'40%',w:420,h:400,c:c2,r:'50% 50% 44% 56%/56% 44% 52% 48%'}].slice(0,n);
  return <div style={{position:'relative',overflow:'hidden',...style}}>
    <div aria-hidden="true" style={{position:'absolute',inset:0,zIndex:0,pointerEvents:'none'}}>
      {spots.map((s,i)=><div key={i} style={{position:'absolute',top:s.t,left:s.l,width:s.w,height:s.h,background:s.c,borderRadius:s.r,filter:'blur(26px)',opacity:.55}} />)}
      {dots&&<div style={{position:'absolute',top:'6%',left:'4%',width:150,height:110,backgroundImage:'radial-gradient(var(--ink-200) 1.5px, transparent 1.5px)',backgroundSize:'13px 13px',opacity:.55}} />}
    </div>
    <div style={{position:'relative',zIndex:1}}>{children}</div>
  </div>;
}
```

---

## §3 — Rules

## Non-negotiables

1. **Use the tokens.** Every colour, size, radius, shadow and duration exists as a `--custom-property`. If a value isn't in `tokens/`, you're inventing — stop and ask.
2. **One accent.** Orange, always as the gradient `--gradient-accent`, always with `--glow-accent` on primary buttons. One primary button per view section.
3. **Two fonts only.** `--font-display` (Bakbak One) for hero lockups and the wordmark — nothing else, ever. `--font-sans` (Poppins) for literally everything else.
4. **Cards have no borders.** White, `--radius-xl` (28px), separated by `--shadow-card` alone.
5. **Everything interactive is a pill.** Buttons, inputs, tags, avatars, arrows: `--radius-pill`.
6. **Never pure black or pure white text.** Headings `--ink-700`, body `--ink-400`, page `--page` (#F8F9FB).
7. **No emoji. No filled icons.** Lucide outline glyphs only, via the `Icon` component.
8. **No flat white backgrounds.** Off-white plus soft organic blobs (`BlobField`) and 13px dot grids.
9. **Never draw a logo.** No mark was supplied — set the brand name in `--font-display`, lowercase.

## Tokens you'll reach for

```css
/* colour */
--accent: #F4562A;            --accent-hover: #DC431A;   --accent-soft: #FFE9DF;
--gradient-accent: linear-gradient(135deg,#FF8A4C,#F4562A);
--highlight: #FFC93C;         /* yellow: props + the offset block behind photos, nothing else */
--text-heading: #3D4A54;      --text-body: #7A8894;      --text-muted: #A7B2BC;
--surface-page: #F8F9FB;      --surface-card: #fff;      --surface-mint: #EAF8F6;  --surface-peach: #FDF2EA;
--border-hairline: #EDF1F4;   --border-input: #D9E0E6;
--tile-1a … --tile-6b        /* six gradients, ONLY inside 54px service icon tiles */

/* type — composite shorthands, use as `font: var(--type-h1)` */
--type-hero  88px/1.0 display     --type-h1 600 40px/1.25    --type-h2 600 32px/1.25
--type-h3    600 22px/1.35        --type-body 400 15px/1.75  --type-sm 400 13px/1.75
--type-button 600 13px/1          --type-nav 500 14px/1      --type-eyebrow 600 13px

/* space / shape */
--space-1…32 (4→128px)   --section-y 128px   --section-y-tight 96px
--container 1140px       --gutter 24px       --container-narrow 720px
--radius-xs 6  sm 10  md 14  lg 20  xl 28  2xl 40  pill 999  media-accent 140px

/* depth + motion */
--shadow-xs / -sm / -card / -media / -tile     --glow-accent
--transition-base: all 220ms cubic-bezier(.22,.61,.36,1)
--press-scale: .97
```

## Layout & motion rules

- 1140px centred container, 24px gutters, 12-col grid. 128px between major sections, 96px for tinted bands.
- Two-column bands alternate which side the image sits on.
- Nothing is sticky by default. `NavBar sticky` adds `--scrim-white` + `--blur-nav`.
- Photography always goes through `MediaFrame`: 24px corners with **one** oversized 140px corner, `--shadow-media`, an offset yellow block bottom-left, optional dot grid.
- Hover: cards lift 3px + deeper shadow; buttons shift gradient + stronger glow; nav links go full ink. Press: `scale(.97)`, no colour change.
- **No bounce, no spring, no parallax, no scroll-jacking, no entrance animations.** 220ms ease-out, 140ms for colour-only.
- Blur only for the sticky-nav scrim and blob softening. Never blur text. No glassmorphism. No text over photos (so no scrims needed).

## Component inventory

| Group | Components |
| --- | --- |
| `core/` | Button, IconButton, Badge, Tag, Card, Icon |
| `forms/` | Input, Select, Checkbox, Switch |
| `navigation/` | NavBar, CarouselNav |
| `marketing/` | DisplayHeading, SectionHeading, ServiceCard, MediaFrame, TestimonialCard, LogoStrip, BlobField |

```jsx
<BlobField tone="peach" density="high" dots style={{padding:'var(--section-y) 0'}}>
  <DisplayHeading sub="is nothing but a mind set free .">creativity</DisplayHeading>
  <Button size="lg">Explore more</Button>
  <IconButton label="Play intro video"><Icon name="play" size={13} /></IconButton>
</BlobField>

<SectionHeading eyebrow="Our case studies" title={<>Conference landing<br/>page redesign.</>} body="…" />
<ServiceCard ramp={4} icon={<Icon name="search" size={22} color="#fff" />} title="SEO Marketing" body="…" />
<Input size="lg" placeholder="Enter your email"
  trailing={<Button iconRight={<Icon name="send" size={13} />}>Send</Button>} />
```

## Copy rules

Sentence case everywhere — headings, buttons, nav, labels. "We" for the studio, "your" for the reader, never "I". Section headings end in a full stop. Hero display word is lowercase. Eyebrow ≤3 words; heading ≤5 words/line, max 2 lines; body 1–3 sentences; button labels 1–3 words ("Explore more", "Read more", "Send"). Italic only for testimonial quotes. Signature quirks to preserve: the spaced period in "is nothing but a mind set free ." and the spaced bang in "Say hi !". No emoji. No enterprise-speak (leverage, solutions, platform), no hype (10x, supercharge, unlock).

## Reference implementation

`ui_kits/marketing-site/index.html` is a working click-through: header routing, hero, services grid, paged case studies and testimonials, email capture with sent state, full contact form. Read `Home.jsx` for how sections compose. `Blog.jsx` is intentionally blank — the source never designed one.

## Known substitutions — confirm before shipping to production

- **Fonts:** Bakbak One (display) and Poppins (text) are Google Fonts stand-ins; loaded from CDN, no local binaries. The original display face is unidentified.
- **Icons:** Lucide via `unpkg` CDN, fetched and inlined by `Icon` so glyphs survive screenshot/PDF/PPTX capture. Original glyph reference: `assets/service-icons-reference.jpg`.
- **Logo:** none exists. Do not create one.
- **Brand name:** "design studio" is taken from the source comp's header; treat it as unconfirmed.
- **Provenance:** every value was measured off a single flattened JPEG comp, not read from code or Figma. If a real codebase or Figma file turns up, it wins over this document.

---

## §4 — Component notes

**Button** — pill CTA, exactly one `primary` per view section. `variant`: `primary` (gradient + glow), `secondary` (white, for tinted sections), `outline`, `ghost`. `size`: `sm | md | lg`. Renders an `<a>` when given `href`. Never square the corners.

**IconButton** — circular, icon-only; requires `label` for accessibility. `light` (white disc, orange glyph) is the default; `accent` for the gradient disc; `outline` for carousel arrows.

**Badge vs Tag** — Badge *announces* (bare orange eyebrow above a section heading, sentence case). Tag *classifies* (lower-contrast tinted chip for categories and filters; pass `onRemove` for a × affordance).

**Card** — white, 28px corners, no border ever. `padding`: `lg` for full-width panels, `md` for content, `sm` for tiles. `interactive` adds the 3px hover lift.

**Icon** — fetches the Lucide SVG and inlines it, so glyphs survive screenshot/PDF/PPTX capture (a CSS mask would flatten to a solid square). Outline only, never filled or duotone. Slugs used across the system: `play`, `send`, `check`, `arrow-right`, `chevron-left`, `chevron-right`, `chevron-down`, `layout-dashboard`, `pen-tool`, `clipboard-list`, `search`, `share-2`, `code`, `facebook`, `twitter`, `instagram`, `linkedin`.

**Input / Select** — identical geometry so they line up in a row; no visible border until focus, when a 1.5px orange keyline plus soft ring appears. The house pattern is an email capture with the CTA nested inside via `trailing`. Use `shape="rounded"` only in dense app-style forms.

**DisplayHeading** — hero lockup only. One lowercase word in the display face, `sub` beneath at ~36% of the size. 88px on a desktop hero, 56–64 on inner pages. Never use the display face for body copy or buttons.

**ServiceCard** — one cell of the services grid: 54px gradient tile, title, two lines of copy. Ramps run 1→6 left-to-right, top-to-bottom; never repeat a ramp within one grid. Sits inside a `Card padding="lg"` with 1px `--border-hairline` dividers between cells.

**MediaFrame** — wrapper for every photograph. One MediaFrame per section max; alternate `accentCorner` between sections. Photos are warm, bright, natural-light, candid — never greyscale, never heavy grain, never duotone.

**BlobField** — paints the brand's organic background behind its children. `tone="mint"` for the case-study band; at most one `density="high"` field per page. Blobs never touch text.

---

## §5 — Known substitutions (confirm before shipping to production)

| What | Substituted with | Why |
| --- | --- | --- |
| Display font | **Bakbak One** (Google Fonts) | Source is a JPEG; the original condensed display face is unidentifiable. Closest free match on weight/width/roundness. |
| Text font | **Poppins** (Google Fonts) | Very likely the original — geometric sans, semibold headings. |
| Icons | **Lucide** via `unpkg` CDN | The comp's service glyphs are ~40px flattened artwork, unrecoverable. |
| Logo / brand mark | **Nothing drawn.** | The comp has a small mark next to "DESIGN STUDIO"; it was not reconstructed. Set the brand name in `--font-display`, lowercase, wherever a mark belongs. **Do not create one.** |
| Client logos | Muted wordmarks | The comp's client marks are placeholder brands. |
| Brand name | "design studio" | Taken from the comp header; treat as unconfirmed. |

If a real codebase or Figma file turns up, **it wins over this document** — every value here was measured off an image.

## Not included

No slide templates (no deck was supplied), no dark theme (none in the source), no app or dashboard kit (no such product in evidence), no data-display components (no tables, charts or lists in the source). If you need any of these, they are new design work — not a recreation.
