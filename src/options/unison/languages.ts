import { getLanguageDisplayName } from "@core/i18n";
import { findBestLanguageMatch } from "@utils";
import { type DropdownOption, filterOptions } from "@/ui/dropdownFilter";

// -- Languages --------------------------

const LANGUAGE_OPTIONS = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "sv",
  "da",
  "no",
  "fi",
  "pl",
  "cs",
  "sk",
  "hu",
  "ro",
  "el",
  "tr",
  "ru",
  "uk",
  "ja",
  "ko",
  "zh",
  "zh-Hant",
  "hi",
  "bn",
  "pa",
  "ta",
  "te",
  "ur",
  "id",
  "ms",
  "vi",
  "th",
  "fil",
  "ar",
  "he",
  "fa",
  "sw",
];

// Canonical bare CLDR codes beyond the curated list, generated from Node 22 ICU so the Unison server accepts each one.
const EXTRA_LANGUAGE_CODES =
  "aa ab ace ach ada ady ae aeb af afh agq ain ak akk akz ale aln alt am an ang ann anp arc arn aro arp arq ars arw ary arz as asa ase ast atj av avk awa ay az ba bal ban bar bas bax bbc bbj be bej bem bew bez bfd bfq bg bgc bgn bho bi bik bin bjn bkm bla blo blt bm bo bpy bqi br bra brh brx bs bss bua bug bum byn byv ca cad car cay cch ccp ce ceb cgg ch chb chg chk chm chn cho chp chr chy cic ckb clc co cop cps cr crg crh crj crk crl crm crr crs csb csw cu cv cy dak dar dav del den dgr din dje doi dsb dtp dua dum dv dyo dyu dz dzg ebu ee efi egl egy eka elx enm eo esu et eu ewo ext fan ff fit fj fo fon frc frm fro frp frr frs fur fy ga gaa gag gan gay gba gbz gd gez gil gl glk gmh gn goh gon gor got grb grc gsw gu guc gur guz gv gwi ha hai hak haw hax hif hil hit hmn hnj ho hr hsb hsn ht hup hur hy hz ia iba ibb ie ig ii ik ikt ilo inh io is iu izh jam jbo jgo jmc jpr jrb jut jv ka kaa kab kac kaj kam kaw kbd kbl kcg kde kea kek ken kfo kg kgp kha kho khq khw ki kiu kj kk kkj kl kln km kmb kn koi kok kos kpe kr krc kri krj krl kru ks ksb ksf ksh ku kum kut kv kw kwk kxv ky la lad lag lah lam lb lez lfn lg li lij lil liv lkt lmo ln lo lol lou loz lrc lsm lt ltg lu lua lui lun luo lus luy lv lzh lzz mad maf mag mai mak man mas mde mdf mdr men mer mfe mg mga mgh mgo mh mi mic min mk ml mn mnc mni moe moh mos mr mrj mt mua mus mwl mwr mwv my mye myv mzn na nan nap naq nd nds ne new ng nia niu njo nmg nnh nog non nov nqo nr nso nus nv nwc ny nym nyn nyo nzi oc oj ojb ojc ojs ojw oka om or os osa ota pag pal pam pap pau pcd pcm pdc pdt peo pfl phn pi pis pms pnt pon pqm prg pro ps qu quc qug raj rap rar rgn rhg rif rm rn rof rom rtm rue rug rup rw rwk sa sad sah sam saq sas sat saz sba sbp sc scn sco sd sdc sdh se see seh sei sel ses sg sga sgs shi shn shu si sid sl slh sli sly sm sma smj smn sms sn snk so sog sq sr srn srr ss ssy st stq str su suk sus sux swb syc syr szl tce tcy tem teo ter tet tg tgx tht ti tig tiv tk tkl tkr tlh tli tly tmh tn to tog tok tpi tru trv trw ts tsd tsi tt ttm ttt tum tvl twq ty tyv tzm udm ug uga umb uz vai ve vec vep vls vmf vmw vo vot vro vun wa wae wal war was wbp wo wuu xal xh xmf xnr xog yao yap yav ybb yi yo yrl yue za zap zbl zea zen zgh zu zun zza".split(
    " "
  );

let extraOptions: DropdownOption[] | null = null;

export function extraLanguageOptions(query: string): DropdownOption[] {
  extraOptions ??= EXTRA_LANGUAGE_CODES.map(code => ({ value: code, label: getLanguageDisplayName(code) })).filter(
    option => option.label !== option.value
  );
  return query.trim() ? filterOptions(extraOptions, query) : [];
}

export function languageOptionList(opts: { leading?: DropdownOption; current?: string } = {}): DropdownOption[] {
  const list: DropdownOption[] = opts.leading ? [opts.leading] : [];
  for (const code of LANGUAGE_OPTIONS) list.push({ value: code, label: getLanguageDisplayName(code) });
  if (opts.current && !list.some(option => option.value === opts.current)) {
    list.push({ value: opts.current, label: getLanguageDisplayName(opts.current) });
  }
  return list;
}

const COVERED_BY_CURATED: Record<string, string> = { nb: "no", nn: "no" };

function bareLanguage(lang: string): string | null {
  try {
    const locale = new Intl.Locale(lang.replace(/_/g, "-"));
    return locale.script ? null : locale.language;
  } catch {
    return null;
  }
}

export function matchLanguageOption(lang: string): string | null {
  const curated = findBestLanguageMatch(lang, LANGUAGE_OPTIONS);
  if (curated) return curated;
  const bare = bareLanguage(lang);
  if (!bare) return null;
  return COVERED_BY_CURATED[bare] ?? (EXTRA_LANGUAGE_CODES.includes(bare) ? bare : null);
}
