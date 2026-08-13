import {ReactNode} from 'react';
import {Pressable,StyleSheet,Text,View} from 'react-native';
import {LinearGradient} from 'expo-linear-gradient';
import {Ionicons} from '@expo/vector-icons';
import {C} from '@/constants/theme';

type Tone = 'green' | 'red' | 'amber' | 'blue';

const toneColor: Record<Tone,string> = {
  green: C.green,
  red: C.red,
  amber: C.amber,
  blue: C.blue,
};

export function Card({children,style}:{children:ReactNode;style?:any}) {
  return <View style={[s.card,style]}>{children}</View>;
}

export function Pill({text,tone='green'}:{text:string;tone?:Tone}) {
  const color = toneColor[tone];
  return (
    <View style={[s.pill,{backgroundColor: color + '22'}]}>
      <Text style={[s.pillText,{color}]}>{text}</Text>
    </View>
  );
}

export function Button({title,onPress,secondary=false,disabled=false}:{title:string;onPress?:()=>void;secondary?:boolean;disabled?:boolean}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={({pressed})=>[s.btn,secondary&&s.btn2,disabled&&s.disabled,pressed&&s.pressed]}>
      <Text style={[s.btnText,secondary&&s.btnText2]}>{title}</Text>
    </Pressable>
  );
}

export function Hero({eyebrow,title,subtitle}:{eyebrow:string;title:string;subtitle:string}) {
  return (
    <LinearGradient colors={['#1A5C49','#09231D']} start={{x:0,y:0}} end={{x:1,y:1}} style={s.hero}>
      <View style={s.heroBadge}><Ionicons name="radio" color={C.lime} size={15}/><Text style={s.eyebrow}>{eyebrow}</Text></View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{subtitle}</Text>
    </LinearGradient>
  );
}

export function StatTile({value,label}:{value:string;label:string}) {
  return (
    <Card style={s.stat}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </Card>
  );
}

const s = StyleSheet.create({
  card: {backgroundColor:C.card,borderColor:C.line,borderWidth:1,borderRadius:18,padding:16},
  pill: {paddingHorizontal:10,paddingVertical:6,borderRadius:99,alignSelf:'flex-start'},
  pillText: {fontWeight:'900',fontSize:11},
  btn: {backgroundColor:C.green,paddingHorizontal:16,paddingVertical:13,borderRadius:14,alignItems:'center',justifyContent:'center',minHeight:46},
  btn2: {backgroundColor:C.card2,borderWidth:1,borderColor:C.line},
  disabled: {opacity:.42},
  pressed: {opacity:.76},
  btnText: {fontWeight:'900',color:'#052117'},
  btnText2: {color:C.white},
  hero: {padding:22,borderRadius:24,marginBottom:18,overflow:'hidden'},
  heroBadge: {flexDirection:'row',alignItems:'center',gap:7},
  eyebrow: {color:C.lime,fontWeight:'900',fontSize:12,letterSpacing:1.2},
  title: {color:C.white,fontWeight:'900',fontSize:30,marginTop:10,lineHeight:36},
  sub: {color:C.muted,marginTop:8,lineHeight:21},
  stat: {width:'48%',alignItems:'center',paddingVertical:18},
  statValue: {color:C.lime,fontSize:28,fontWeight:'900'},
  statLabel: {color:C.muted,fontSize:12,marginTop:4},
});
