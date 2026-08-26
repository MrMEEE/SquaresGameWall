# Run GameWall on OKD

This guide deploys GameWall to OKD with persistent storage for the `characters` folder.
It uses a Red Hat UBI 10 Python runtime image and an explicit OpenShift BuildConfig manifest.

## Prerequisites

- Access to an OKD cluster
- `oc` CLI logged in
- Permission to create project, build, deploy, and route resources

## 1) Create or select a project

    oc new-project gamewall

If the project already exists:

    oc project gamewall

## 2) Build the image in OKD using BuildConfig

The container image is built from `Dockerfile`, which uses:

    registry.access.redhat.com/ubi10/python-312-minimal:1787605542

Apply ImageStream and BuildConfig manifests:

    oc apply -f deploy/okd/imagestream.yaml
    oc apply -f deploy/okd/buildconfig.yaml

Start a build from the Git source configured in BuildConfig:

    oc start-build gamewall --follow

This produces image stream tag `gamewall:latest` in your project.

If the Git repository is private, add an SSH source secret and reference it in `deploy/okd/buildconfig.yaml`.

If you see `InvalidOutputReference` with `Output image could not be resolved`, run:

    oc apply -f deploy/okd/imagestream.yaml
    oc patch buildconfig/gamewall --type=merge -p '{"spec":{"output":{"to":{"kind":"ImageStreamTag","name":"gamewall:latest"}}}}'
    oc start-build gamewall --follow

Optional checks:

    oc get is gamewall
    oc get bc gamewall -o yaml | grep -A6 "output:"

If you see `Operation not permitted` during image build on a `chgrp`/`chmod` step,
use the current `Dockerfile` in this repo (it intentionally avoids privileged
ownership mutation steps for OKD build pods).

Rebuild after updating:

    oc start-build gamewall --follow

## 3) Create persistent volume claim for character data

Apply this PVC:

oc apply -f deploy/okd/pvc.yaml

Adjust storage class and size if your cluster requires it.

## 4) Deploy app from the built image

Create app:

    oc new-app --image-stream=gamewall:latest --name=gamewall

Mount persistent storage at `/opt/app-root/src/characters`:

    oc set volume deploy/gamewall \
      --add --name=characters \
      --type=pvc --claim-name=gamewall-characters \
    --mount-path=/opt/app-root/src/characters

Expose service as route:

    oc expose svc/gamewall

## 5) Set probes (recommended)

GameWall serves static files and API from one process. Use root path checks.

    oc set probe deploy/gamewall \
      --readiness --get-url=http://:8080/ --initial-delay-seconds=5 --timeout-seconds=2

    oc set probe deploy/gamewall \
      --liveness --get-url=http://:8080/ --initial-delay-seconds=20 --timeout-seconds=2

## 6) Verify deployment

Check pods:

    oc get pods

Check logs:

    oc logs -f deploy/gamewall

Get route:

    oc get route gamewall

Open the route URL in your browser.

## 7) Update after code changes

From repo root:

    oc start-build gamewall --follow
    oc rollout restart deploy/gamewall

Watch rollout:

    oc rollout status deploy/gamewall

## 8) Important networking note for Twinkly

GameWall can proxy requests to local Twinkly devices via `/proxy`, but your OKD pod must be able to reach those private IPs.

If Twinkly calls fail from OKD but work locally, check:

- Cluster egress policy/firewall rules
- Routing from worker nodes to your LAN subnet
- NetworkPolicy restrictions in project

## 9) Optional: one-command cleanup

Deletes app resources (keeps project):

    oc delete all -l app=gamewall

Delete PVC too (this removes saved characters):

    oc delete pvc gamewall-characters
