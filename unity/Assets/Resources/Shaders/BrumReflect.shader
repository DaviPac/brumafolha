// Water reflections: the mirrored scene (TEXCOORD0) kept only where the water mask (TEXCOORD1) is,
// tinted toward the water colour ("source-atop" in the canvas version), at the vertex alpha.
Shader "Brum/Reflect" {
  Properties { _MainTex ("Reflection", 2D) = "white" {} _Mask ("Water mask", 2D) = "white" {} _Tint ("Tint", Color) = (0.094, 0.376, 0.47, 0.45) }
  SubShader {
    Tags { "Queue" = "Transparent" "RenderType" = "Transparent" }
    Cull Off ZWrite Off ZTest Always
    Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
    Pass {
      CGPROGRAM
      #pragma vertex vert
      #pragma fragment frag
      #include "UnityCG.cginc"
      sampler2D _MainTex; sampler2D _Mask; float4 _Tint;
      struct a2v { float4 vertex : POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; float2 uv2 : TEXCOORD1; };
      struct v2f { float4 pos : SV_POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; float2 uv2 : TEXCOORD1; };
      v2f vert (a2v v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.color = v.color; o.uv = v.uv; o.uv2 = v.uv2; return o; }
      fixed4 frag (v2f i) : SV_Target {
        fixed4 c = tex2D(_MainTex, i.uv);
        fixed m = tex2D(_Mask, i.uv2).a;
        c.rgb = lerp(c.rgb, _Tint.rgb, _Tint.a);
        c.a *= m * i.color.a;
        return c;
      }
      ENDCG
    }
  }
}
