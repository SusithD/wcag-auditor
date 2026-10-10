() => ({
  has_meta_viewport: !!document.querySelector('meta[name="viewport" i]'),
  layout_width: document.documentElement.clientWidth,
  scroll_width: document.documentElement.scrollWidth,
  inner_width: window.innerWidth,
  visual_viewport_scale: window.visualViewport ? Math.round(window.visualViewport.scale * 1000) / 1000 : 1 })
