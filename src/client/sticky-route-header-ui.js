export function shouldShowCompactRouteHeader({ routeHeaderBottom, topbarHeight, routePageHidden = false }) {
  return !routePageHidden && routeHeaderBottom <= topbarHeight;
}
