// Per-environment settings for the public site. This is the only file that
// changes between deployments; nothing else under js/ needs editing.
//
//   apiBase  The DLS Portal host that receives the inquiry form, without a
//            trailing slash, e.g. "https://portal.durablelifeskills.com".
//            Leave it "" while the site and the portal are served from the
//            same host. When they are not, the portal's API must list this
//            site's origin in its PUBLIC_FORM_ORIGINS setting, or the browser
//            will refuse the request.
window.DLS_CONFIG = {
  apiBase: "",
};
