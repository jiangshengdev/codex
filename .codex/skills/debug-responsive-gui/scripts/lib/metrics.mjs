#!/usr/bin/env node

export const metricsExpression = `JSON.stringify({
  url: location.href,
  title: document.title,
  innerWidth,
  innerHeight,
  outerWidth,
  outerHeight,
  dpr: devicePixelRatio,
  visualViewport: visualViewport
    ? { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale }
    : null,
  documentElementClientWidth: document.documentElement.clientWidth,
  bodyClientWidth: document.body ? document.body.clientWidth : null,
  maxTouchPoints: navigator.maxTouchPoints,
  ua: navigator.userAgent,
  viewportMeta: document.querySelector('meta[name=viewport]')?.getAttribute('content') || null
})`;

export function isCodexGui(metrics) {
  return metrics?.title === 'codex-gui' && typeof metrics?.url === 'string';
}

export function responsiveLike(metrics) {
  if (!metrics) {
    return false;
  }
  const width = metrics.documentElementClientWidth ?? metrics.bodyClientWidth ?? metrics.innerWidth;
  const hasMobileWidth = typeof width === 'number' && width > 0 && width <= 500;
  const hasTouch = Number(metrics.maxTouchPoints) > 0;
  const mobileUa = /Mobile|iPhone|Android/i.test(metrics.ua ?? '');
  return hasMobileWidth && (hasTouch || mobileUa);
}

export function summarizeMetrics(metrics) {
  return {
    url: metrics?.url ?? null,
    title: metrics?.title ?? null,
    innerWidth: metrics?.innerWidth ?? null,
    innerHeight: metrics?.innerHeight ?? null,
    outerWidth: metrics?.outerWidth ?? null,
    outerHeight: metrics?.outerHeight ?? null,
    dpr: metrics?.dpr ?? null,
    documentElementClientWidth: metrics?.documentElementClientWidth ?? null,
    bodyClientWidth: metrics?.bodyClientWidth ?? null,
    maxTouchPoints: metrics?.maxTouchPoints ?? null,
    responsiveLike: responsiveLike(metrics),
  };
}
