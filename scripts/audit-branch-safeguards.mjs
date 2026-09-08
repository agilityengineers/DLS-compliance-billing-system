#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const apiBase = process.env.GITHUB_API_URL || "https://api.github.com";
const mainBranch = process.env.MAIN_BRANCH || "main";
const safetyBranch =
  process.env.SAFETY_BRANCH || "claude/dls-cms-design-review-s6prak";
const requiredCheck = process.env.REQUIRED_CHECK || "DLS-CMS Typecheck";
// The number of approving reviews is whatever the versioned policy says, so
// the audit follows the policy file instead of a hard-coded 1 (a one-person
// repository legitimately runs at 0 until a second reviewer account exists).
const policyPath = process.env.POLICY_FILE || ".github/main-branch-protection.json";
const policy = JSON.parse(await readFile(policyPath, "utf8"));
const expectedApprovals =
  policy.required_pull_request_reviews?.required_approving_review_count ?? 1;

if (!repository) {
  throw new Error("GITHUB_REPOSITORY is required (expected owner/repository).");
}

async function getEffectiveRules(branch) {
  const headers = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dls-branch-safeguard-audit",
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(
    `${apiBase}/repos/${repository}/rules/branches/${encodeURIComponent(branch)}?per_page=100`,
    { headers },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Unable to read effective rules for ${branch}: GitHub returned ${response.status}. ${detail}`,
    );
  }

  return response.json();
}

const failures = [];

function requireSafeguard(condition, message) {
  if (!condition) failures.push(message);
}

const [mainRules, safetyRules] = await Promise.all([
  getEffectiveRules(mainBranch),
  getEffectiveRules(safetyBranch),
]);
const mainRule = (type) => mainRules.find((rule) => rule.type === type);
const pullRequestRule = mainRule("pull_request");
const statusCheckRule = mainRule("required_status_checks");
const requiredContexts =
  statusCheckRule?.parameters?.required_status_checks?.map(
    (check) => check.context,
  ) ?? [];

requireSafeguard(
  mainRule("non_fast_forward") !== undefined,
  `${mainBranch}: force-push protection is disabled`,
);
requireSafeguard(
  mainRule("deletion") !== undefined,
  `${mainBranch}: deletion protection is disabled`,
);
requireSafeguard(
  pullRequestRule !== undefined,
  `${mainBranch}: a pull request is not required before merging`,
);
requireSafeguard(
  (pullRequestRule?.parameters?.required_approving_review_count ?? -1) >= expectedApprovals,
  `${mainBranch}: fewer approving reviews required than the versioned policy (${expectedApprovals})`,
);
requireSafeguard(
  statusCheckRule?.parameters?.strict_required_status_checks_policy === true,
  `${mainBranch}: required checks do not require an up-to-date branch`,
);
requireSafeguard(
  requiredContexts.includes(requiredCheck),
  `${mainBranch}: required check "${requiredCheck}" is missing`,
);
requireSafeguard(
  pullRequestRule?.parameters?.required_review_thread_resolution === true,
  `${mainBranch}: review conversations are not required to be resolved`,
);
requireSafeguard(
  safetyRules.some((rule) => rule.type === "deletion"),
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
  console.log(`- ${mainBranch}: a pull request, ${expectedApprovals} approving review(s) and "${requiredCheck}" are required`);
  console.log(`- ${safetyBranch}: deletion is blocked`);
}