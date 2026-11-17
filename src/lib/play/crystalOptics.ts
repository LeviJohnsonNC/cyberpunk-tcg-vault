import * as THREE from 'three';
import { meshFor, type DicePalette } from './diceMesh';

/** Trace rays through the convex die instead of treating crystal as a single glass pane. */
export function crystalOptics(type: string, palette: DicePalette, environment: THREE.CubeTexture) {
  const faces = meshFor(type).faces;
  const planes = faces.map(face => new THREE.Vector4(...face.normal, new THREE.Vector3(...face.normal).dot(new THREE.Vector3(...face.center))));
  return new THREE.ShaderMaterial({
    uniforms: {
      studio: { value: environment },
      planes: { value: planes },
      cameraLocal: { value: new THREE.Vector3(0, 0, 5) },
      orientation: { value: new THREE.Matrix3() },
      tint: { value: new THREE.Color(`rgb(${palette.rim.join(',')})`) },
    },
    vertexShader: `
      varying vec3 point, faceNormal;
      void main() {
        point = position; faceNormal = normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform samplerCube studio;
      uniform vec4 planes[${faces.length}];
      uniform vec3 cameraLocal, tint;
      uniform mat3 orientation;
      varying vec3 point, faceNormal;

      vec3 environment(vec3 ray) {
        vec3 direction = orientation * ray;
        vec3 light = textureCube(studio, direction).rgb;
        light.r = textureCube(studio, direction + vec3(.004, .002, 0.0)).r;
        light.b = textureCube(studio, direction - vec3(.004, .002, 0.0)).b;
        return light;
      }
      vec3 throughCrystal(vec3 ray, float ior) {
        vec3 origin = point - faceNormal * .001;
        vec3 direction = refract(ray, faceNormal, 1.0 / ior);
        vec3 light = vec3(0.0), energy = vec3(1.0);
        for (int bounce = 0; bounce < 4; bounce++) {
          float distance = 100.0;
          vec3 normal = faceNormal;
          for (int i = 0; i < ${faces.length}; i++) {
            float facing = dot(direction, planes[i].xyz);
            float hit = (planes[i].w - dot(origin, planes[i].xyz)) / facing;
            if (facing > .0001 && hit > .0001 && hit < distance) {
              distance = hit; normal = planes[i].xyz;
            }
          }
          origin += direction * distance;
          energy *= exp(-distance * (vec3(1.0) - tint) * 1.8);
          vec3 exitRay = refract(direction, -normal, ior);
          float fresnel = .1 + .9 * pow(1.0 - abs(dot(direction, normal)), 5.0);
          if (dot(exitRay, exitRay) > .001) {
            light += environment(exitRay) * energy * (1.0 - fresnel);
            energy *= fresnel;
          }
          direction = reflect(direction, normal);
          origin += direction * .001;
        }
        return light + environment(direction) * energy * .25;
      }
      void main() {
        vec3 incident = normalize(point - cameraLocal);
        vec3 normal = normalize(faceNormal);
        float fresnel = .1 + .9 * pow(1.0 - abs(dot(incident, normal)), 5.0);
        vec3 transmitted = throughCrystal(incident, 2.1);
        vec3 reflected = environment(reflect(incident, normal));
        float faceRadius = length(point - normal * dot(point, normal));
        float well = .025 + .975 * smoothstep(.2, .52, faceRadius);
        gl_FragColor = vec4((transmitted * (1.0 - fresnel) + reflected * fresnel * .55) * well, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}
