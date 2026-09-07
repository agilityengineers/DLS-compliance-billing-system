#!/usr/bin/env node

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const mainBranch = process.env.MAIN_BRANCH || "main";
const safetyBranch =
  process.env.SAFETY_BRANCH || "claude/dls-cms-design-review-s6prak";
const requiredCheck = process.env.REQUIRED_CHECK || "DLS-CMS Typecheck";

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required (expected owner/repository).");
}

if (!token) {
  throw new Error("GITHUB_TOKEN is required for the read-only protection audit.");
}

async function getProtection(branch) {
  const response = await fetch(
    `${apiBase}/repos/${repository}/branches/${encodeURIComponent(branch)}/protection`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "dls-branch-safeguard-audit",
      },
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unable to read protection for ${branch}: GitHub returned ${response.status}. ` +
        `The workflow is read-only and needs permission to inspect branch protection. ${detail}`,
    );
  }

  return response.json();
}

function enabled(protection, field) {
  return protection[field]?.enabled === true;
}

const failures = [];

function requireSafeguard(condition, message) {
  if (!condition) failures.push(message);
}

const [mainProtection, safetyProtection] = await Promise.all([
  getProtection(mainBranch),
  getProtection(safetyBranch),
]);

const reviewRules = mainProtection.required_pull_request_reviews;
const statusRules = mainProtection.required_status_checks;
const statusContexts = statusRules?.contexts ?? [];

requireSafeguard(
  !enabled(mainProtection, "allow_force_pushes"),
  `${mainBranch}: force-push protection is disabled`,
);
requireSafeguard(
  !enabled(mainProtection, "allow_deletions"),
  `${mainBranch}: deletion protection is disabled`,
);
requireSafeguard(
  enabled(mainProtection, "enforce_admins"),
  `${mainBranch}: safeguards do not apply to administrators`,
);
requireSafeguard(
  reviewRules?.required_approving_review_count >= 1,
  `${mainBranch}: at least one approving review is not required`,
);
requireSafeguard(
  statusRules?.strict === true,
  `${mainBranch}: required checks do not require an up-to-date branch`,
);
requireSafeguard(
  statusContexts.includes(requiredCheck),
  `${mainBranch}: required check "${requiredCheck}" is missing`,
);
requireSafeguard(
  enabled(mainProtection, "required_conversation_resolution"),
  `${mainBranch}: review conversations are not required to be resolved`,
);
requireSafeguard(
  !enabled(safetyProtection, "allow_deletions"),
  `${safetyBranch}: deletion protection is disabled`,
);

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`::error title=Branch safeguard drift::${failure}`);
  }
  console.error(
    `Branch safeguard audit failed with ${failures.length} configuration problem(s).`,
  );
  process.exitCode = 1;
} else {
  console.log("Branch safeguard audit passed.");
  console.log(`- ${mainBranch}: force-pushes and deletion are blocked`);
  console.log(`- ${mainBranch}: one review and "${requiredCheck}" are required`);
  console.log(`- ${mainBranch}: protections apply to administrators`);
  console.log(`- ${safetyBranch}: deletion is blocked`);
}