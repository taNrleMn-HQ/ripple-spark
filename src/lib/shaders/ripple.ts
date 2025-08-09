export const rippleVertex = `
attribute vec2 a_pos;
varying vec2 v_uv;
void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const rippleFragment = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2  u_res;
uniform vec2  u_center;
uniform float u_time;
uniform float u_duration;
uniform float u_strength;
uniform float u_speed;
uniform float u_width;

float ring(float d, float r, float w){
  float x = (d - r) / max(w, 0.0001);
  return exp(-x*x*4.0);
}

// Flip V for DOM snapshot textures without relying on UNPACK_FLIP_Y_WEBGL
vec2 flipY(vec2 uv){
  return vec2(uv.x, 1.0 - uv.y);
}

void main(){
  vec2 uv = v_uv;
  vec2 px = uv * u_res;
  vec2 cpx = u_center * u_res;

  float t = clamp(u_time, 0.0, u_duration);
  float play = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(u_duration - 0.20, u_duration, t));

  float radius = u_speed * t;
  float d = distance(px, cpx);
  float k = ring(d, radius, u_width) * play;

  vec2 dir = normalize(px - cpx + 0.0001);
  float disp = u_strength * k;

  vec2 uv_r = flipY((px + dir * (disp * 1.00)) / u_res);
  vec2 uv_g = flipY((px + dir * (disp * 0.80)) / u_res);
  vec2 uv_b = flipY((px + dir * (disp * 0.60)) / u_res);

  float micro = 0.2 * sin((d - radius) * 0.05) * k;
  uv_r += dir * micro / u_res;
  uv_g -= dir * micro / u_res;

  vec3 color = vec3(
    texture2D(u_tex, uv_r).r,
    texture2D(u_tex, uv_g).g,
    texture2D(u_tex, uv_b).b
  );
  gl_FragColor = vec4(color, play);
}
`;
