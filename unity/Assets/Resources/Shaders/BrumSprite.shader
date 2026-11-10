// Textured quads with straight alpha, tinted by the vertex colour: the canvas' default "source-over".
Shader "Brum/Sprite" {
  Properties { _MainTex ("Texture", 2D) = "white" {} }
  SubShader {
    Tags { "Queue" = "Transparent" "RenderType" = "Transparent" }
    Cull Off ZWrite Off ZTest Always
    Blend SrcAlpha OneMinusSrcAlpha, One OneMinusSrcAlpha
    Pass {
      CGPROGRAM
      #pragma vertex vert
      #pragma fragment frag
      #include "UnityCG.cginc"
      sampler2D _MainTex;
      struct a2v { float4 vertex : POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };
      struct v2f { float4 pos : SV_POSITION; float4 color : COLOR; float2 uv : TEXCOORD0; };
      v2f vert (a2v v) { v2f o; o.pos = UnityObjectToClipPos(v.vertex); o.color = v.color; o.uv = v.uv; return o; }
      fixed4 frag (v2f i) : SV_Target { return tex2D(_MainTex, i.uv) * i.color; }
      ENDCG
    }
  }
}
